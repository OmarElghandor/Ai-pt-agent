import { z } from 'zod';
import { modeForPreset, PresetSchema } from '@/lib/v2/content/page';
import type { LessonBrief } from '../brief';
import type { KnownIdTl } from '../hash';
import { getDayPlan } from '../plan';
import { buildOutlineSystemPrompt } from '../prompts';
import type { OutlineResult } from '../stages/types';
import { validateOutline } from '../stages/outline';
import {
  fatal,
  fix,
  formatRetryHints,
  warning,
  type TierIssue,
} from '../tiers';
import { callJobTool } from './call';

/** Slim outline tool — code fills page_id + mode. */
export const OutlineToolSchema = z.object({
  pages: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        preset: PresetSchema,
        title_eg: z.string().min(1),
        introduces: z.array(z.string()).default([]),
        purpose_eg: z.string().min(1),
      }),
    )
    .min(1),
});

function truncateWords(s: string, max: number): { text: string; truncated: boolean } {
  const words = s.trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) return { text: words.join(' '), truncated: false };
  return { text: words.slice(0, max).join(' '), truncated: true };
}

function dropUnknownIds(
  ids: string[],
  known: Set<string>,
  path: string,
): { kept: string[]; fixes: TierIssue[] } {
  const fixes: TierIssue[] = [];
  const kept: string[] = [];
  for (const id of ids) {
    if (known.has(id)) kept.push(id);
    else fixes.push(warning(path, 'unknown_item_ref', `dropped ${id}`));
  }
  return { kept, fixes };
}

function normTl(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[…!.?,]+$/g, '')
    .trim();
}

/** Code-owned outline fixes: recycle strip, unique presets, story ending, early_chunks. */
function postProcessOutline(
  outline: OutlineResult,
  opts: {
    recycleIds: string[];
    earlyChunks: string[];
    isStory: boolean;
    items: KnownIdTl[];
  },
): { outline: OutlineResult; fixes: TierIssue[] } {
  const fixes: TierIssue[] = [];
  const recycle = new Set(opts.recycleIds);
  let pages = outline.pages.map((p) => {
    const kept = (p.introduces ?? []).filter((id) => {
      if (recycle.has(id)) {
        fixes.push(
          fix(
            `pages[${p.index}].introduces`,
            'recycle_intro',
            `removed recycle ${id}`,
          ),
        );
        return false;
      }
      return true;
    });
    return { ...p, introduces: kept };
  });

  // Unique presets — keep first occurrence of each.
  const seen = new Set<string>();
  const deduped: typeof pages = [];
  for (const p of pages) {
    if (seen.has(p.preset)) {
      fixes.push(
        fix(`pages[${p.index}]`, 'duplicate_preset', `dropped duplicate ${p.preset}`),
      );
      continue;
    }
    seen.add(p.preset);
    deduped.push(p);
  }
  pages = deduped.map((p, i) => ({
    ...p,
    index: i,
    page_id: `p${i}_${p.preset}`,
  }));

  if (!opts.isStory) {
    const last = pages[pages.length - 1];
    if (!last || last.preset !== 'story') {
      const idx = pages.length;
      pages.push({
        index: idx,
        page_id: `p${idx}_story`,
        preset: 'story',
        mode: modeForPreset('story'),
        title: 'اختبر نفسك في الحوار',
        purpose: 'حوار قصير مع اللي اتعلمته النهارده',
        introduces: [],
        assumes: pages.flatMap((p) => p.introduces),
        handoff: '',
      });
      fixes.push(fix('pages', 'story_ending', 'appended story self-test page'));
    }
  }

  // early_chunks → phrases page introduces
  if (opts.earlyChunks.length) {
    const phrasesPage = pages.find((p) => p.preset === 'phrases');
    if (phrasesPage) {
      const chunkIds: string[] = [];
      for (const chunk of opts.earlyChunks) {
        const n = normTl(chunk);
        const hit = opts.items.find(
          (it) =>
            (it.type === 'phrase' || it.type === 'sentence') &&
            normTl(it.tl).includes(n),
        );
        if (hit) chunkIds.push(hit.id);
      }
      const merged = [...new Set([...phrasesPage.introduces, ...chunkIds])];
      if (merged.length !== phrasesPage.introduces.length) {
        fixes.push(
          fix(
            `pages[${phrasesPage.index}].introduces`,
            'early_chunks',
            `added ${chunkIds.join(', ')}`,
          ),
        );
      }
      phrasesPage.introduces = merged;
    }
  }

  return { outline: { ...outline, pages }, fixes };
}

export async function runOutlineJob(opts: {
  brief: LessonBrief;
  items: KnownIdTl[];
}): Promise<{
  outline: OutlineResult;
  issues: string[];
  fatals: TierIssue[];
  fixes: TierIssue[];
  warnings: TierIssue[];
  flagged: boolean;
  retries: number;
  auto_fix_count: number;
  timing: Awaited<ReturnType<typeof callJobTool>>['timing'];
  tokens: Awaited<ReturnType<typeof callJobTool>>['tokens'];
  over_budget: boolean;
  model: string;
  provider: Awaited<ReturnType<typeof callJobTool>>['provider'];
  userBody: string;
  systemModules: { name: string; version: string }[];
}> {
  const dayPlan = getDayPlan(opts.brief.day);
  const gen = dayPlan.generation ?? {};
  const presets =
    opts.brief.planned_presets.length > 0
      ? opts.brief.planned_presets
      : (gen.page_plan ?? []).map((p) => p.preset);
  const pagePlan =
    (gen.page_plan ?? [])
      .map((p, i) => `${i + 1}. ${p.preset}${p.focus ? ` — ${p.focus}` : ''}`)
      .join('\n') ||
    presets.map((p, i) => `${i + 1}. ${p}`).join('\n') ||
    '(choose presets that fit)';

  const knownIds = new Set(opts.items.map((i) => i.id));
  const itemLines = opts.items
    .map((i) => `${i.id} (${i.type}): ${i.tl}`)
    .join('\n');

  const user = `STAGE: OUTLINE ONLY
Return { "pages": [...] } via submit_outline.
Each page: index, preset, title_eg, introduces[], purpose_eg (≤15 words).
Use only ITEM_DIGEST ids in introduces — do not invent new ids.
Code sets page_id and mode.

PAGE_PLAN
${pagePlan}

ITEM_DIGEST
${itemLines || '(none)'}
`;

  const systemModules = [
    { name: 'core', version: '1' },
    { name: 'outline', version: '1' },
  ];

  const buildFromTool = (data: z.infer<typeof OutlineToolSchema>) => {
    const fixes: TierIssue[] = [];
    const warnings: TierIssue[] = [];
    const pages = data.pages.map((p, i) => {
      const purpose = truncateWords(p.purpose_eg, 15);
      if (purpose.truncated) {
        fixes.push(
          fix(`pages[${i}].purpose_eg`, 'purpose_truncate', 'truncated to 15 words'),
        );
      }
      const intro = dropUnknownIds(
        p.introduces ?? [],
        knownIds,
        `pages[${i}].introduces`,
      );
      fixes.push(...intro.fixes);
      const page_id = `p${p.index}_${p.preset}`;
      return {
        index: p.index,
        page_id,
        preset: p.preset,
        mode: modeForPreset(p.preset),
        title: p.title_eg,
        purpose: purpose.text,
        introduces: intro.kept,
        assumes: [] as string[],
        handoff: '',
      };
    });
    const rawOutline: OutlineResult = {
      items: opts.items.map((i) => ({
        type: i.type,
        id: i.id,
        tl: i.tl,
      })) as OutlineResult['items'],
      pages,
    };
    const processed = postProcessOutline(rawOutline, {
      recycleIds: opts.brief.recycle_ids,
      earlyChunks: opts.brief.early_chunks_tl,
      isStory: Boolean(dayPlan.is_story),
      items: opts.items,
    });
    fixes.push(...processed.fixes);
    const outline = processed.outline;
    const outlineIssues = validateOutline(outline);
    for (const iss of outlineIssues) {
      warnings.push(warning(iss.path, iss.rule, iss.message));
    }
    return { outline, fixes, warnings };
  };

  let call = await callJobTool({
    kind: 'outline',
    label: 'outline',
    systemPrompt: buildOutlineSystemPrompt(),
    brief: opts.brief,
    userBody: user,
    toolName: 'submit_outline',
    toolDescription: 'Submit the day outline pages.',
    schema: OutlineToolSchema,
    systemModules,
  });

  let retries = 0;
  let parsed = OutlineToolSchema.safeParse(call.data);
  if (!parsed.success || !Array.isArray((call.data as { pages?: unknown })?.pages)) {
    retries = 1;
    const hints = formatRetryHints([
      fatal(
        'pages',
        'schema',
        parsed.success
          ? 'missing pages'
          : parsed.error.issues[0]?.message ?? 'schema failed',
      ),
    ]);
    call = await callJobTool({
      kind: 'outline',
      label: 'outline:retry',
      systemPrompt: buildOutlineSystemPrompt(),
      brief: opts.brief,
      userBody: `${user}\n\n${hints}`,
      toolName: 'submit_outline',
      toolDescription: 'Submit the day outline pages.',
      schema: OutlineToolSchema,
    });
    parsed = OutlineToolSchema.safeParse(call.data);
    if (!parsed.success) {
      return {
        outline: { items: [], pages: [] },
        issues: [],
        fatals: [fatal('pages', 'schema', 'outline schema failed after retry')],
        fixes: [],
        warnings: [],
        flagged: true,
        retries,
        auto_fix_count: 0,
        timing: call.timing,
        tokens: call.tokens,
        over_budget: call.over_budget,
        model: call.model,
        provider: call.provider,
        userBody: user,
        systemModules,
      };
    }
  }

  let built = buildFromTool(parsed.data);
  // One retry only if somehow empty pages (fatal)
  if (!built.outline.pages.length && retries === 0) {
    retries = 1;
    call = await callJobTool({
      kind: 'outline',
      label: 'outline:retry',
      systemPrompt: buildOutlineSystemPrompt(),
      brief: opts.brief,
      userBody: `${user}\n\n${formatRetryHints([fatal('pages', 'empty', 'need ≥1 page')])}`,
      toolName: 'submit_outline',
      toolDescription: 'Submit the day outline pages.',
      schema: OutlineToolSchema,
    });
    parsed = OutlineToolSchema.safeParse(call.data);
    if (parsed.success) built = buildFromTool(parsed.data);
  }

  const fatals: TierIssue[] = !built.outline.pages.length
    ? [fatal('pages', 'empty', 'no pages after retry')]
    : [];

  return {
    outline: built.outline,
    issues: built.warnings.map((w) => `${w.rule}: ${w.path}: ${w.message}`),
    fatals,
    fixes: built.fixes,
    warnings: built.warnings,
    flagged: built.warnings.length > 0 || built.fixes.length > 0,
    retries,
    auto_fix_count: built.fixes.length,
    timing: call.timing,
    tokens: call.tokens,
    over_budget: call.over_budget,
    model: call.model,
    provider: call.provider,
    userBody: user,
    systemModules,
  };
}
