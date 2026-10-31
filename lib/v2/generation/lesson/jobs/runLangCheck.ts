import { z } from 'zod';
import type { Item } from '@/lib/v2/content/items';
import type { Page } from '@/lib/v2/content/page';
import type { LessonBrief } from '../brief';
import { callJobTool } from './call';

export const LangCheckPatchSchema = z.object({
  path: z.string().min(1),
  wrong_tl: z.string().min(1),
  fixed_tl: z.string().min(1),
  fixed_ar: z.string().optional(),
  reason_eg: z.string().min(1),
});

export const LangCheckSchema = z.object({
  patches: z.array(LangCheckPatchSchema).max(5),
});

export type LangCheckPatch = z.infer<typeof LangCheckPatchSchema>;

export function collectReviewPayload(
  pages: Page[],
  items: Item[],
  opts?: { readingTl?: string },
) {
  const dialogue: unknown[] = [];
  for (const [pi, page] of pages.entries()) {
    for (const [bi, block] of page.blocks.entries()) {
      if (block.type !== 'dialogue') continue;
      dialogue.push({
        path_prefix: `pages[${pi}].blocks[${bi}]`,
        page_index: pi,
        page_id: page.id,
        block_id: block.id,
        lines: block.lines.map((l, li) => ({
          path: `pages[${pi}].blocks[${bi}].lines[${li}].tl`,
          i: li,
          speaker: l.speaker,
          tl: l.tl,
          ar: l.ar,
          ids: l.ids,
        })),
      });
    }
  }
  const derived = items
    .filter(
      (i) =>
        i.type === 'phrase' &&
        ((i as { derived?: boolean }).derived ||
          /^pattern\..+\.ex\.\d+$/.test(i.id)),
    )
    .map((i) => ({
      path: `items[${i.id}].tl`,
      id: i.id,
      tl: 'tl' in i ? i.tl : '',
      ar: 'ar' in i ? (i as { ar?: string }).ar : '',
    }));
  // Words used by plural_def patterns must carry plural_tl for the reviewer
  const pluralNeeded = new Set<string>();
  for (const i of items) {
    if (i.type !== 'pattern') continue;
    const kind = (i as { kind?: string }).kind;
    if (kind !== 'plural_def' && i.id !== 'pattern.plural_s') continue;
    for (const slot of i.slots ?? []) {
      if (
        slot &&
        typeof slot === 'object' &&
        'fills' in slot &&
        Array.isArray(slot.fills)
      ) {
        for (const id of slot.fills as string[]) pluralNeeded.add(id);
      }
    }
  }
  const plurals = items
    .filter((i) => i.type === 'word' && pluralNeeded.has(i.id))
    .map((i) => ({
      path: `items[${i.id}].plural_tl`,
      id: i.id,
      tl: i.tl,
      plural_tl:
        (i as { plural_tl?: string }).plural_tl ??
        (i as { plural?: string }).plural ??
        '',
      gender: (i as { gender?: string }).gender,
    }));
  const reading = opts?.readingTl?.trim()
    ? { path: 'story.reading.tl', tl: opts.readingTl.trim() }
    : null;
  return { dialogue, derived, plurals, reading };
}

/**
 * Post-assemble pt-PT patches for dialogue lines + derived examples.
 * Never regenerates — caller applies patches in code.
 */
export async function runLangCheckJob(opts: {
  brief: LessonBrief;
  pages: Page[];
  items: Item[];
  /** Weekly story reading passage (lang-checked with dialogue). */
  readingTl?: string;
}): Promise<{
  patches: LangCheckPatch[];
  timing: Awaited<ReturnType<typeof callJobTool>>['timing'];
  tokens: Awaited<ReturnType<typeof callJobTool>>['tokens'];
  over_budget: boolean;
  model: string;
  provider: Awaited<ReturnType<typeof callJobTool>>['provider'];
  userBody: string;
  systemModules: { name: string; version: string }[];
}> {
  const payload = collectReviewPayload(opts.pages, opts.items, {
    readingTl: opts.readingTl,
  });
  const systemModules = [{ name: 'lang_check', version: '1' }];
  const user = `STAGE: LANG_CHECK (pt-PT only)
Review dialogue lines + derived pattern examples + plural_tl on listed words${
    payload.reading ? ' + weekly story.reading.tl' : ''
  } for European Portuguese (Lisbon).
If a tl is wrong (Brazilian, bad gender/article, unnatural), emit a patch.
For PLURALS: if plural_tl is missing or wrong (must be bare noun, no article — e.g. "ovos", "maçãs"), patch with path items[id].plural_tl, wrong_tl = current plural_tl or "(missing)", fixed_tl = correct bare plural.
Do NOT review Arabic/EG tips/questions. Do NOT invent new lines.

PATHS: use the exact path field from the payload (pages[i].blocks[j].lines[k].tl or items[id].tl or items[id].plural_tl or story.reading.tl).
wrong_tl MUST equal the current tl/plural_tl string exactly (or "(missing)").
fixed_ar is optional (MSA). reason_eg is short Egyptian.

DIALOGUE:
${JSON.stringify(payload.dialogue)}

DERIVED PATTERN EXAMPLES:
${JSON.stringify(payload.derived)}

PLURALS (must have correct plural_tl):
${JSON.stringify(payload.plurals)}

READING (weekly only; null if none):
${JSON.stringify(payload.reading)}

Return { "patches": [{ path, wrong_tl, fixed_tl, fixed_ar?, reason_eg }] } via submit_lang_check.
Max 5 patches. Empty array if clean. Never regenerate pages.
`;

  const systemPrompt = `You are a strict European Portuguese (pt-PT) proofreader for A0–A1 café/street Portuguese in Lisbon.
Prefer Queria / Podia, o senhor / a senhora, or verb without pronoun. Never teach "use você when in doubt". Never Brazilian (ônibus, trem, celular, café da manhã).
Output ONLY patches for clear errors. Empty patches = pass.`;

  let call: Awaited<ReturnType<typeof callJobTool>>;
  try {
    call = await callJobTool({
      kind: 'lang_check',
      label: 'lang_check',
      systemPrompt,
      brief: opts.brief,
      userBody: user,
      toolName: 'submit_lang_check',
      toolDescription: 'Submit pt-PT patches (max 5). Empty if clean.',
      schema: LangCheckSchema,
      maxTokens: 2_048,
      systemModules,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[v2-gen:lang_check] skipped: ${msg}`);
    return {
      patches: [],
      timing: {
        label: 'lang_check',
        duration_ms: 0,
        input_tokens: 0,
        output_tokens: 0,
        usd_estimate: 0,
      },
      tokens: { system: 0, input: 0, output: 0 },
      over_budget: false,
      model: 'skipped',
      provider: 'anthropic',
      userBody: user,
      systemModules,
    };
  }

  const parsed = LangCheckSchema.safeParse(call.data);
  const patches = parsed.success ? parsed.data.patches.slice(0, 5) : [];
  return {
    patches,
    timing: call.timing,
    tokens: call.tokens,
    over_budget: call.over_budget,
    model: call.model,
    provider: call.provider,
    userBody: user,
    systemModules,
  };
}
