import { z } from 'zod';
import { callClaudeJson, zodToolSchema } from '@/lib/generation/claudeClient';
import { PresetSchema, ModeSchema } from '@/lib/v2/content/page';
import type { Issue } from '@/lib/v2/content/validate';
import {
  buildDayRequest,
  collectKnownItems,
  loadExistingImageKeys,
  verifiedLemmas,
} from '../buildRequest';
import { callTimingFromResult, type CallTiming } from '../cost';
import { canGenerate, getDayPlan } from '../plan';
import { loadPriorPacks } from '../save';
import { withJsonFooter } from './jsonFooter';
import { buildCachedSystemBlocks } from './sharedPrefix';
import {
  MAX_TOKENS_OUTLINE,
  OutlineResultSchema,
  normalizeOutlineItems,
  type OutlineResult,
} from './types';

/** Tool JSON schema without Zod transforms (title may be string or rich text). */
const OutlineToolSchema = z.object({
  items: z
    .array(
      z
        .object({
          type: z.string(),
          id: z.string(),
        })
        .passthrough(),
    )
    .min(1),
  pages: z
    .array(
      z
        .object({
          index: z.number().int().nonnegative(),
          page_id: z.string().min(1),
          preset: PresetSchema,
          mode: ModeSchema,
          title: z.union([z.string(), z.array(z.unknown())]),
          purpose: z.string().min(1),
          introduces: z.array(z.string()).optional(),
          assumes: z.array(z.string()).optional(),
          handoff: z.string().optional(),
        })
        .passthrough(),
    )
    .min(1),
  lesson: z.record(z.string(), z.unknown()).optional(),
});

const SUBMIT_OUTLINE_TOOL = {
  name: 'submit_outline',
  description: 'Submit the day outline: item bank, page plan, and optional lesson meta.',
  inputSchema: zodToolSchema(OutlineToolSchema),
};

const OUTLINE_JSON_SKELETON = `{
  "items": [{ "type": "phrase", "id": "phrase.hello", "tl": "Olá!", "ar": "مرحبا." }],
  "pages": [{
    "index": 0,
    "page_id": "p1",
    "preset": "phrases",
    "mode": "guided",
    "title": "جمل",
    "purpose": "…",
    "introduces": ["phrase.hello"],
    "assumes": [],
    "handoff": "…"
  }],
  "lesson": { "situation": { "tl": "…", "eg": "…" }, "can_do": [{ "eg": "…", "proves": ["phrase.hello"] }] }
}`;

function issue(
  path: string,
  rule: string,
  message: string,
): Issue {
  return { path, rule, message, severity: 'error' };
}

/** Validate outline refs and preset/mode rules (no page bodies yet). */
export function validateOutline(outline: OutlineResult): Issue[] {
  const issues: Issue[] = [];
  const itemIds = new Set(outline.items.map((i) => i.id));
  const introduced = new Set<string>();
  const pageIds = new Set<string>();

  const sorted = [...outline.pages].sort((a, b) => a.index - b.index);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i]!.index !== i) {
      issues.push(
        issue('pages', 'outline_index', `page indexes must be contiguous from 0; gap at ${i}`),
      );
      break;
    }
  }

  for (const page of sorted) {
    if (pageIds.has(page.page_id)) {
      issues.push(issue(`pages[${page.index}]`, 'duplicate_page_id', `duplicate ${page.page_id}`));
    }
    pageIds.add(page.page_id);

    const presetOk = PresetSchema.safeParse(page.preset);
    const modeOk = ModeSchema.safeParse(page.mode);
    if (!presetOk.success) {
      issues.push(issue(`pages[${page.index}].preset`, 'bad_preset', String(page.preset)));
    }
    if (!modeOk.success) {
      issues.push(issue(`pages[${page.index}].mode`, 'bad_mode', String(page.mode)));
    }

    for (const id of page.introduces) {
      if (!itemIds.has(id)) {
        issues.push(
          issue(`pages[${page.index}].introduces`, 'bad_ref', `unknown item ${id}`),
        );
      }
      if (introduced.has(id)) {
        issues.push(
          issue(
            `pages[${page.index}].introduces`,
            'duplicate_intro',
            `${id} already introduced on an earlier page`,
          ),
        );
      }
      introduced.add(id);
    }

    for (const id of page.assumes) {
      if (!itemIds.has(id)) {
        issues.push(issue(`pages[${page.index}].assumes`, 'bad_ref', `unknown item ${id}`));
      } else if (!introduced.has(id) && !page.introduces.includes(id)) {
        // assumes must already be introduced on earlier pages
        const earlier = sorted
          .filter((p) => p.index < page.index)
          .some((p) => p.introduces.includes(id));
        if (!earlier) {
          issues.push(
            issue(
              `pages[${page.index}].assumes`,
              'assumes_before_intro',
              `${id} is not introduced on any earlier page`,
            ),
          );
        }
      }
    }
  }

  // Each preset at most once per day
  const seenPreset = new Map<string, number>();
  for (const page of sorted) {
    const prev = seenPreset.get(page.preset);
    if (prev != null) {
      issues.push(
        issue(
          `pages[${page.index}]`,
          'duplicate_preset',
          `preset "${page.preset}" already used on page ${prev}`,
        ),
      );
    } else {
      seenPreset.set(page.preset, page.index);
    }
  }

  // Outline titles are learner-facing Egyptian — flag MSA markers
  const MSA_IN_EG = ['أريد', 'ماذا', 'لماذا', 'هذا', 'هذه', 'الذي', 'سوف', 'ليس'];
  for (const page of sorted) {
    const title = typeof page.title === 'string' ? page.title : '';
    for (const m of MSA_IN_EG) {
      if (title.includes(m)) {
        issues.push(
          issue(
            `pages[${page.index}].title`,
            'arabic_register',
            `MSA marker "${m}" in outline title (use Egyptian)`,
          ),
        );
      }
    }
  }

  return issues;
}

export async function runOutlineStage(opts: {
  day: number;
  targetLang?: string;
}): Promise<{
  outline: OutlineResult;
  issues: Issue[];
  timing: CallTiming;
  model: string;
}> {
  const dayPlan = getDayPlan(opts.day);
  const ready = canGenerate(dayPlan);
  if (!ready.ok) {
    throw new Error(`Cannot generate day ${opts.day}: ${ready.reason}`);
  }

  const prior = await loadPriorPacks(opts.day, opts.targetLang);
  const knownItems = collectKnownItems(prior);
  const dayRequest = buildDayRequest({
    dayPlan,
    knownItems,
    existingImageKeys: loadExistingImageKeys(),
    targetLang: opts.targetLang,
  });

  const verbs = verifiedLemmas(opts.targetLang ?? 'pt-PT');
  const user = withJsonFooter(`${dayRequest}

STAGE: OUTLINE ONLY
Return ONE JSON object with:
- items: full item bank for the day (words, phrases, sentences, patterns as needed). Do NOT put conjugated verb surface forms; use form ids later.
- pages: ordered page plan. For EACH page:
  { index (0-based), page_id, preset, mode, title (short Egyptian or plain string), purpose (one line), introduces: item_ids (first appearance), assumes: item_ids (already introduced earlier), handoff (one line: what the next page builds on) }
- lesson: optional meta { situation, can_do, kind, week, phase }

SKELETON (fill this shape):
${OUTLINE_JSON_SKELETON}

Rules:
- introduces are disjoint across pages.
- assumes ⊆ items introduced on earlier pages.
- Cover NEW_ITEMS and RECYCLE. Every new item id appears in exactly one introduces list.
- Match PAGE_PLAN presets when given.
- Do NOT write page blocks, steps, or questions in this stage.
- Pattern item slots must be { "tl": "..." } or { "name_eg": "..." }.
- VERB_TABLE lemmas only: ${verbs.join(', ')}
`);

  console.info(`[v2-gen:stage] day=${opts.day} outline starting`);

  const systemBlocks = buildCachedSystemBlocks({ includeExamples: true });

  const result = await callClaudeJson('', user, {
    label: 'outline',
    maxTokens: MAX_TOKENS_OUTLINE,
    systemBlocks,
    tool: SUBMIT_OUTLINE_TOOL,
  });

  const toOutline = (data: unknown): OutlineResult | { error: string } => {
    const parsed = OutlineResultSchema.safeParse(data);
    if (!parsed.success) return { error: parsed.error.message };
    const items = normalizeOutlineItems(parsed.data.items);
    if (items.length === 0) return { error: 'no valid items after normalize' };
    return {
      items,
      pages: parsed.data.pages,
      lesson: parsed.data.lesson,
    };
  };

  let outlineOrErr = toOutline(result.data);
  let timingMs = result.durationMs;
  let usage = { ...result.usage };
  let model = result.model;

  if ('error' in outlineOrErr) {
    const retry = await callClaudeJson(
      '',
      withJsonFooter(`${user}

PREVIOUS OUTPUT FAILED SCHEMA:
${outlineOrErr.error}
Return valid outline JSON only. Pattern item slots must be { "tl": "..." } or { "name_eg": "..." }.`),
      {
        label: 'outline:retry',
        maxTokens: MAX_TOKENS_OUTLINE,
        systemBlocks,
        tool: SUBMIT_OUTLINE_TOOL,
      },
    );
    timingMs += retry.durationMs;
    usage = {
      input_tokens: (usage.input_tokens ?? 0) + (retry.usage?.input_tokens ?? 0),
      output_tokens: (usage.output_tokens ?? 0) + (retry.usage?.output_tokens ?? 0),
      cache_creation_input_tokens:
        (usage.cache_creation_input_tokens ?? 0) +
        (retry.usage?.cache_creation_input_tokens ?? 0),
      cache_read_input_tokens:
        (usage.cache_read_input_tokens ?? 0) + (retry.usage?.cache_read_input_tokens ?? 0),
    };
    model = retry.model;
    outlineOrErr = toOutline(retry.data);
    if ('error' in outlineOrErr) {
      throw new Error(`Outline schema failed twice: ${outlineOrErr.error}`);
    }
  }

  const issues = validateOutline(outlineOrErr);
  return {
    outline: outlineOrErr,
    issues,
    timing: callTimingFromResult({
      label: 'outline',
      durationMs: timingMs,
      usage,
    }),
    model,
  };
}
