import { z } from 'zod';
import { modeForPreset, PresetSchema } from '@/lib/v2/content/page';
import type { LessonBrief } from '../brief';
import type { KnownIdTl } from '../hash';
import type { StoryHandoff } from '../handoffs';
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
import { fillEmptyDetailAssumes } from '../pageAllow';
import { orderVocabFlowIds } from '@/lib/v2/vocabFlow/orderItems';
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

/** Order detail pages by first appearance of their introduces in the story. */
function orderPagesByStory(
  pages: OutlineResult['pages'],
  story: StoryHandoff | undefined,
): OutlineResult['pages'] {
  if (!story?.item_first_index?.length) return pages;
  const firstLine = new Map(
    story.item_first_index.map((e) => [e.id, e.line]),
  );
  const score = (p: OutlineResult['pages'][number]) => {
    if (p.preset === 'story' || p.role === 'intro') return -1;
    const lines = (p.introduces ?? [])
      .map((id) => firstLine.get(id))
      .filter((n): n is number => n != null);
    if (!lines.length) return 999;
    return Math.min(...lines);
  };
  return [...pages].sort((a, b) => score(a) - score(b));
}

/** Code-owned outline fixes: recycle strip, unique presets, story pointer, early_chunks. */
function postProcessOutline(
  outline: OutlineResult,
  opts: {
    recycleIds: string[];
    earlyChunks: string[];
    isStory: boolean;
    items: KnownIdTl[];
    story?: StoryHandoff;
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

  // Drop model-emitted story pages — code owns the intro story pointer.
  pages = pages.filter((p) => {
    if (p.preset === 'story') {
      fixes.push(fix(`pages[${p.index}]`, 'story_owned', 'dropped model story page'));
      return false;
    }
    return true;
  });

  // If vocab_flow is present, drop legacy dictionary/phrases siblings.
  {
    const hasVocab = pages.some((p) => p.preset === 'vocab_flow');
    if (hasVocab) {
      const before = pages.length;
      pages = pages.filter((p) => {
        if (p.preset === 'dictionary' || p.preset === 'phrases') {
          fixes.push(
            fix(
              `pages[${p.index}]`,
              'vocab_flow_replace',
              `dropped ${p.preset} (vocab_flow present)`,
            ),
          );
          return false;
        }
        return true;
      });
      if (pages.length !== before) {
        // fall through
      }
    }
  }

  // Collapse dictionary + phrases into one vocab_flow (new days / PAGE_PLAN).
  {
    const dictPages = pages.filter((p) => p.preset === 'dictionary');
    const phrasePages = pages.filter((p) => p.preset === 'phrases');
    const hasVocab = pages.some((p) => p.preset === 'vocab_flow');
    if (!hasVocab && (dictPages.length || phrasePages.length)) {
      const firstIdx = Math.min(
        ...[...dictPages, ...phrasePages].map((p) =>
          pages.findIndex((x) => x === p),
        ),
      );
      const mergedIntro = [
        ...new Set([
          ...dictPages.flatMap((p) => p.introduces ?? []),
          ...phrasePages.flatMap((p) => p.introduces ?? []),
        ]),
      ];
      const title =
        phrasePages[0]?.title ||
        dictPages[0]?.title ||
        'الكلمات والجمل';
      const purpose =
        phrasePages[0]?.purpose ||
        dictPages[0]?.purpose ||
        'شوف كلمات وجمل اليوم';
      const drop = new Set([...dictPages, ...phrasePages]);
      const next: typeof pages = [];
      let inserted = false;
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i]!;
        if (drop.has(p)) {
          if (!inserted && i === firstIdx) {
            next.push({
              ...p,
              preset: 'vocab_flow',
              mode: modeForPreset('vocab_flow'),
              title,
              purpose,
              introduces: mergedIntro,
            });
            inserted = true;
          }
          fixes.push(
            fix(
              `pages[${p.index}]`,
              'vocab_flow_merge',
              `collapsed ${p.preset} into vocab_flow`,
            ),
          );
          continue;
        }
        next.push(p);
      }
      if (!inserted) {
        next.splice(Math.max(0, firstIdx), 0, {
          index: firstIdx,
          page_id: 'p_vocab_flow',
          preset: 'vocab_flow',
          mode: modeForPreset('vocab_flow'),
          title,
          purpose,
          introduces: mergedIntro,
          assumes: [],
          handoff: '',
        });
      }
      pages = next;
    }
  }

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
  pages = deduped;

  // Order detail pages by story item appearance when story exists.
  // Weekly story days: story pointer only (no detail pages from model story preset).
  // Soft story: if story is missing, skip page 0 / replay and order by core items.
  if (!opts.isStory) {
    pages = orderPagesByStory(pages, opts.story);
  } else {
    pages = [];
  }
  if (opts.story?.story_id) {
    pages = [
      {
        index: 0,
        page_id: 'p0_story',
        preset: 'story',
        mode: modeForPreset('story'),
        role: 'intro' as const,
        title: 'القصة',
        purpose: opts.isStory
          ? 'قصة الأسبوع'
          : 'شوف الموقف قبل التفصيل',
        introduces: [],
        assumes: [...opts.recycleIds],
        handoff: `story_id:${opts.story.story_id}`,
      },
      ...pages,
    ];
    fixes.push(fix('pages', 'story_pointer', 'prepended intro story pointer page'));
  } else {
    fixes.push(
      fix(
        'pages',
        'story_missing',
        'no story handoff — skipped page 0 / replay; pages ordered by core items',
      ),
    );
  }

  pages = pages.map((p, i) => ({
    ...p,
    index: i,
    page_id: `p${i}_${p.preset}`,
    ...(i === 0 && p.preset === 'story'
      ? { role: 'intro' as const, introduces: [] as string[] }
      : {}),
  }));

  // early_chunks → vocab_flow (preferred) or legacy phrases page
  if (opts.earlyChunks.length) {
    const target =
      pages.find((p) => p.preset === 'vocab_flow') ??
      pages.find((p) => p.preset === 'phrases');
    if (target) {
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
      const merged = [...new Set([...target.introduces, ...chunkIds])];
      if (merged.length !== target.introduces.length) {
        fixes.push(
          fix(
            `pages[${target.index}].introduces`,
            'early_chunks',
            `added ${chunkIds.join(', ')}`,
          ),
        );
      }
      target.introduces = merged;
    }
  }

  // vocab_flow introduces = today's words + phrases, story-first (words before phrases that use them)
  {
    const vf = pages.find((p) => p.preset === 'vocab_flow');
    if (vf) {
      const wordIds = opts.items
        .filter((it) => it.type === 'word')
        .map((it) => it.id);
      const phraseIds = opts.items
        .filter((it) => it.type === 'phrase' || it.type === 'sentence')
        .map((it) => it.id);
      const candidateIds = [
        ...new Set([...wordIds, ...phraseIds, ...vf.introduces]),
      ];
      const ordered = orderVocabFlowIds({
        candidateIds,
        items: opts.items.map((it) => ({
          id: it.id,
          type: it.type,
          tl: it.tl,
        })),
        itemFirstIndex: opts.story?.item_first_index,
      });
      if (
        ordered.length !== vf.introduces.length ||
        ordered.some((id, i) => id !== vf.introduces[i])
      ) {
        fixes.push(
          fix(
            `pages[${vf.index}].introduces`,
            'vocab_flow_order',
            `set ${ordered.length} word+phrase ids (story-first)`,
          ),
        );
      }
      vf.introduces = ordered;
    }
  }

  // Dictionary introduces = every word.* from today's bank (never a subset) — legacy packs
  {
    const dictPage = pages.find((p) => p.preset === 'dictionary');
    if (dictPage) {
      const wordIds = opts.items
        .filter((it) => it.type === 'word')
        .map((it) => it.id);
      if (wordIds.length) {
        const merged = [...new Set([...wordIds, ...dictPage.introduces])];
        // Prefer core word order first, then any non-word introduces already there
        const ordered = [
          ...wordIds,
          ...merged.filter((id) => !wordIds.includes(id)),
        ];
        if (
          ordered.length !== dictPage.introduces.length ||
          ordered.some((id, i) => id !== dictPage.introduces[i])
        ) {
          fixes.push(
            fix(
              `pages[${dictPage.index}].introduces`,
              'dictionary_all_words',
              `set ${wordIds.length} word ids`,
            ),
          );
        }
        dictPage.introduces = ordered;
      }
    }
  }

  // «بيقولوها كده»: after vocab_flow, else dictionary, else phrases.
  // Skip on weekly story days (pages already emptied above).
  if (!opts.isStory) {
    pages = pages.filter((p) => {
      if (p.preset === 'real_world') {
        fixes.push(
          fix(
            `pages[${p.index}]`,
            'real_world_owned',
            'dropped model real_world page',
          ),
        );
        return false;
      }
      return true;
    });
    const rwEntry = {
      index: 0,
      page_id: 'p_real_world',
      preset: 'real_world' as const,
      mode: modeForPreset('real_world'),
      title: 'بيقولوها كده',
      purpose: 'عبارات الناس فعلاً بتقولها',
      introduces: [] as string[],
      assumes: [] as string[],
      handoff: '',
    };
    const vocabIdx = pages.findIndex((p) => p.preset === 'vocab_flow');
    const dictIdx = pages.findIndex((p) => p.preset === 'dictionary');
    const phrasesIdx = pages.findIndex((p) => p.preset === 'phrases');
    let insertAfter = -1;
    let insertNote = 'appended real_world as last detail';
    if (vocabIdx >= 0) {
      insertAfter = vocabIdx;
      insertNote = 'inserted real_world after vocab_flow';
    } else if (dictIdx >= 0) {
      insertAfter = dictIdx;
      insertNote = 'inserted real_world after dictionary';
    } else if (phrasesIdx >= 0) {
      insertAfter = phrasesIdx;
      insertNote = 'inserted real_world after phrases';
    }
    if (insertAfter >= 0) {
      pages = [
        ...pages.slice(0, insertAfter + 1),
        rwEntry,
        ...pages.slice(insertAfter + 1),
      ];
    } else {
      pages = [...pages, rwEntry];
    }
    fixes.push(fix('pages', 'real_world_insert', insertNote));
    pages = pages.map((p, i) => ({
      ...p,
      index: i,
      page_id: `p${i}_${p.preset}`,
      ...(i === 0 && p.preset === 'story'
        ? { role: 'intro' as const, introduces: [] as string[] }
        : {}),
    }));
  }

  const assumed = fillEmptyDetailAssumes(pages);
  for (const row of assumed.filled) {
    fixes.push(
      fix(
        `pages[${row.index}].assumes`,
        'assume_prior',
        `assumes ${row.assumes.join(', ')}`,
      ),
    );
  }
  pages = assumed.pages;

  return { outline: { ...outline, pages }, fixes };
}

export async function runOutlineJob(opts: {
  brief: LessonBrief;
  items: KnownIdTl[];
  story?: StoryHandoff;
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

  const storyBlock = opts.story
    ? `STORY (already written — detail pages follow item order; quote real line indexes in tips/examples)
story_id: ${opts.story.story_id}
setting: ${opts.story.setting}
lines:
${opts.story.lines.map((l) => `  [${l.index}] ${l.speaker}: ${l.tl}  ids=[${l.ids.join(',')}]`).join('\n')}
item_first_index: ${opts.story.item_first_index.map((e) => `${e.id}@${e.line}`).join(', ')}
`
    : '(no story handoff)';

  const user = `STAGE: OUTLINE ONLY
Return { "pages": [...] } via submit_outline.
Each page: index, preset, title_eg, introduces[], purpose_eg (≤15 words).
Use only ITEM_DIGEST ids in introduces — do not invent new ids.
Code sets page_id and mode.
Do NOT emit a story preset — code prepends the intro story pointer from STORY.
Order detail pages so items appear in the same order as STORY item_first_index.
Tips/examples on later pages must quote real story line indexes only.

STORY
${storyBlock}

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
      story: opts.story,
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
