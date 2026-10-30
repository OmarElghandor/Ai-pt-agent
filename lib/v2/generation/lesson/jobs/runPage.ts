import { z } from 'zod';
import { BlockSchema } from '@/lib/v2/content/blocks';
import {
  modeForPreset,
  StepSchema,
  type Page,
  type Preset,
  type Mode,
} from '@/lib/v2/content/page';
import type { Item } from '@/lib/v2/content/items';
import type { LessonBrief } from '../brief';
import { approxTokens } from '../budgets';
import { verifiedLemmas } from '../buildRequest';
import type { NeighborPageStub } from '../handoffs';
import { formatPresetExampleForPrompt } from '../presets';
import { buildPageSystemPrompt, PRESET_CATALOGS } from '../prompts';
import type { OutlinePagePlan } from '../stages/types';
import { validatePageAgainstOutline } from '../stages/page';
import {
  PageJobSchema,
  finalizeGenPage,
  hydratePageToolResult,
  summarizePagePayload,
} from '../schemas/page';
import {
  blockIndexForKey,
  mergeBlockRegen,
} from '../blockCritic';
import { hydrateDialogueBlocks } from '../dialogueChecks';
import { reorderGuidedSteps } from '../guidedSteps';
import { fixPluralVsPairs } from '../patternFill';
import { normalizePageJson } from '../stages/page';
import { callJobTool } from './call';

export const BlockRegenSchema = z.object({
  blocks: z.array(BlockSchema).min(1),
  steps: z.array(StepSchema).optional(),
});

/** @deprecated Prefer PageJobSchema — kept for JOB_SCHEMAS / tests alias. */
export { PageJobSchema as PageOnlySchema };

function stripPracticeQuestionIds(page: Page): Page {
  return {
    ...page,
    blocks: page.blocks.map((b) =>
      b.type === 'practice' ? { ...b, questions: [] } : b,
    ),
    quiz: undefined,
  };
}

export async function runPageJob(opts: {
  brief: LessonBrief;
  entry: OutlinePagePlan;
  allowedItems: Item[];
  prev?: NeighborPageStub | null;
  next?: NeighborPageStub | null;
  /** Full outline items bank for validation. */
  allItems?: Item[];
  /** Critic notes for a regen pass. */
  criticNotes?: string[];
  /** Existing page + block keys → rewrite only those blocks (+ their steps). */
  existingPage?: Page;
  blockTargets?: string[];
}): Promise<{
  page: Page;
  taught_eg: string;
  issues: string[];
  fatals: { path: string; rule: string; message: string; tier: 'fatal' }[];
  warnings: {
    path: string;
    rule: string;
    message: string;
    tier: 'warning';
  }[];
  fixes: { path: string; rule: string; message: string; tier: 'fix' }[];
  flagged: boolean;
  retries: number;
  auto_fix_count: number;
  timing: Awaited<ReturnType<typeof callJobTool>>['timing'];
  tokens: Awaited<ReturnType<typeof callJobTool>>['tokens'];
  over_budget: boolean;
  model: string;
  provider: Awaited<ReturnType<typeof callJobTool>>['provider'];
  attempts: number;
  userBody: string;
  systemModules: { name: string; version: string }[];
  cachedExampleName?: string;
}> {
  if (
    opts.existingPage &&
    opts.blockTargets &&
    opts.blockTargets.length > 0
  ) {
    return runBlockRegenJob(opts as typeof opts & {
      existingPage: Page;
      blockTargets: string[];
    });
  }

  const preset = opts.entry.preset as Preset;
  const mode = (opts.entry.mode ?? modeForPreset(preset)) as Mode;
  const exampleText = formatPresetExampleForPrompt(preset);
  const exampleTokens = exampleText ? approxTokens(exampleText) : 0;
  const systemPrompt = buildPageSystemPrompt(preset, mode);
  const verbs = verifiedLemmas();
  const allowed = opts.allowedItems.map((i) => i.id).join(', ');
  const bank = opts.allItems ?? opts.allowedItems;
  const cachedExampleName = `presets/${preset}.json`;
  const catalog = PRESET_CATALOGS[preset] ?? PRESET_CATALOGS.phrases;

  const criticBlock =
    opts.criticNotes && opts.criticNotes.length
      ? `\nCRITIC NOTES (fix these):\n${opts.criticNotes.map((n) => `- ${n}`).join('\n')}\n`
      : '';

  const introIds = (opts.entry.introduces ?? []).join(', ') || '(none)';
  const assumeIds = (opts.entry.assumes ?? []).join(', ') || '(none)';
  const user = `STAGE: ONE PAGE
Write ONLY page index ${opts.entry.index} (${opts.entry.page_id}).
Mode is ${mode} (fixed by code). Do not put question ids in practice.questions — leave [].
Targets are block addresses only (never item ids like phrase.x).
ITEM IDS: use ONLY ids from Allowed ids below (exact strings). Do not invent pattern.X / phrase.X.
Every introduces id must appear on the page: ${introIds}
Assumes (may reuse): ${assumeIds}
Also return taught_eg: one Egyptian line summarizing what this page taught.
${criticBlock}
PLAN ENTRY:
${JSON.stringify({ ...opts.entry, mode })}

PREV PAGE: ${opts.prev ? JSON.stringify(opts.prev) : '(none)'}
NEXT PAGE: ${opts.next ? JSON.stringify(opts.next) : '(none)'}

ALLOWED ITEMS (full):
${JSON.stringify(opts.allowedItems)}

Allowed ids: ${allowed || '(none)'}
VERB_TABLE: ${verbs.join(', ')}

REQUIRED OUTPUT: { "page": { "title": [...rt], "blocks": [≥1], ... }, "taught_eg": "…" }
Do NOT omit page.blocks. Expected block order for ${preset}: ${catalog.blocks}
Code fills page.id / preset / mode — you may omit them.
Return via submit_page.
`;

  const systemModules = [
    { name: 'core', version: '1' },
    { name: 'pageCatalog', version: '1' },
  ];

  let attempts = 0;
  let call: Awaited<ReturnType<typeof callJobTool>> | null = null;
  let page: Page | undefined;
  let taught_eg = '';
  let issues: string[] = [];
  let lastUserBody = user;
  const softWarnings: string[] = [];

  const { formatRetryHints, warning: tierWarn } = await import('../tiers');

  while (attempts < 2) {
    attempts += 1;
    const guidedHint =
      mode === 'guided'
        ? '\nGUIDED: page.steps 12–20 (ask ~every 4th; none in first 3).'
        : '';
    const body =
      attempts === 1
        ? `${user}${guidedHint}`
        : `${user}${guidedHint}\n\n${formatRetryHints(
            issues.slice(0, 5).map((m) =>
              tierWarn(`page`, 'retry', m.slice(0, 120)),
            ),
          )}`;
    lastUserBody = body;
    call = await callJobTool({
      kind: 'page',
      label: `page:${opts.entry.page_id}${attempts > 1 ? ':retry' : ''}`,
      systemPrompt,
      brief: opts.brief,
      userBody: body,
      toolName: 'submit_page',
      toolDescription: 'Submit one lesson page with title and blocks.',
      schema: PageJobSchema,
      cachedExtra: exampleText || undefined,
      exampleTokens: exampleTokens || undefined,
      maxTokens: mode === 'guided' ? 10_000 : undefined,
      guidedPage: mode === 'guided',
      systemModules,
      cachedExampleName,
    });

    // Keep model strings through Zod; normalizePageJson/finalize converts to rt.
    const hydrated = hydratePageToolResult(call.data, opts.entry, mode);
    const parsed = PageJobSchema.safeParse(hydrated);
    if (!parsed.success) {
      const shape = summarizePagePayload(call.data);
      issues = [
        parsed.error.issues[0]?.message ?? 'schema failed',
        `shape: ${shape}`,
      ];
      console.warn(
        `[v2-gen:page] schema fail page=${opts.entry.page_id} attempt=${attempts} ${shape}`,
      );
      continue;
    }
    taught_eg = parsed.data.taught_eg?.trim() || '';
    page = stripPracticeQuestionIds(
      finalizeGenPage(parsed.data.page, opts.entry, mode),
    );
    page = hydrateDialogueBlocks(page, bank);
    page = fixPluralVsPairs(page, bank) as Page;
    const guided = reorderGuidedSteps(page);
    page = guided.page;
    softWarnings.push(...guided.warnings);

    const vIssues = validatePageAgainstOutline(
      page,
      { ...opts.entry, mode },
      bank,
    );
    for (const b of page.blocks) {
      if (b.type === 'practice' && b.questions.length > 0) {
        softWarnings.push('practice_ids_forbidden: cleared by code');
        (b as { questions: string[] }).questions = [];
      }
    }
    const guidedFatals = vIssues.filter(
      (vi) =>
        vi.rule === 'guided_step_count' ||
        vi.rule === 'ask_density' ||
        vi.rule === 'ask_early',
    );
    // Soft: keep most page issues as warnings
    for (const vi of vIssues) {
      softWarnings.push(`${vi.rule}: ${vi.message}`);
    }
    // Guided step rules: retry once instead of accepting a 2-step page
    if (guidedFatals.length && attempts < 2) {
      issues = guidedFatals.map((vi) => `${vi.rule}: ${vi.message}`);
      continue;
    }
    issues = [];
    break;
  }

  if (!page || !call) {
    // Fatal only when no page at all after retry
    throw new Error(
      `Page ${opts.entry.page_id} missing page key after retry`,
    );
  }

  return {
    page,
    taught_eg,
    issues: softWarnings,
    fatals: [] as { path: string; rule: string; message: string; tier: 'fatal' }[],
    warnings: softWarnings.map((m) => ({
      path: opts.entry.page_id,
      rule: 'page',
      message: m,
      tier: 'warning' as const,
    })),
    fixes: [],
    flagged: softWarnings.length > 0,
    retries: Math.max(0, attempts - 1),
    auto_fix_count: 0,
    timing: call.timing,
    tokens: call.tokens,
    over_budget: call.over_budget,
    model: call.model,
    provider: call.provider,
    attempts,
    userBody: lastUserBody,
    systemModules,
    cachedExampleName,
  };
}

/**
 * Critic-driven block regen: rewrite only target blocks (+ steps that target them).
 */
async function runBlockRegenJob(opts: {
  brief: LessonBrief;
  entry: OutlinePagePlan;
  allowedItems: Item[];
  allItems?: Item[];
  criticNotes?: string[];
  existingPage: Page;
  blockTargets: string[];
}): Promise<{
  page: Page;
  taught_eg: string;
  issues: string[];
  fatals: { path: string; rule: string; message: string; tier: 'fatal' }[];
  warnings: {
    path: string;
    rule: string;
    message: string;
    tier: 'warning';
  }[];
  fixes: { path: string; rule: string; message: string; tier: 'fix' }[];
  flagged: boolean;
  retries: number;
  auto_fix_count: number;
  timing: Awaited<ReturnType<typeof callJobTool>>['timing'];
  tokens: Awaited<ReturnType<typeof callJobTool>>['tokens'];
  over_budget: boolean;
  model: string;
  provider: Awaited<ReturnType<typeof callJobTool>>['provider'];
  attempts: number;
  userBody: string;
  systemModules: { name: string; version: string }[];
  cachedExampleName?: string;
}> {
  const preset = opts.entry.preset as Preset;
  const mode = (opts.entry.mode ?? modeForPreset(preset)) as Mode;
  const bank = opts.allItems ?? opts.allowedItems;
  const systemPrompt = buildPageSystemPrompt(preset, mode);
  const systemModules = [
    { name: 'core', version: '1' },
    { name: 'pageCatalog', version: '1' },
    { name: 'block_regen', version: '1' },
  ];
  const frozen = opts.existingPage;
  const targets = opts.blockTargets;
  const targetBlocks = targets
    .map((k) => {
      const i = blockIndexForKey(frozen, k);
      return i >= 0 ? frozen.blocks[i] : null;
    })
    .filter(Boolean);
  const criticBlock =
    opts.criticNotes && opts.criticNotes.length
      ? `\nCRITIC NOTES (fix these):\n${opts.criticNotes.map((n) => `- ${n}`).join('\n')}\n`
      : '';

  const user = `STAGE: BLOCK REGEN
Rewrite ONLY these blocks on page ${opts.entry.page_id}: ${targets.join(', ')}.
Keep the same block ids. Do NOT rewrite other blocks.
Also return steps that target those blocks only (guided); omit steps for other blocks.
${criticBlock}
FROZEN PAGE (context — do not rewrite siblings):
${JSON.stringify(frozen)}

TARGET BLOCKS TO REPLACE:
${JSON.stringify(targetBlocks)}

ALLOWED ITEMS:
${JSON.stringify(opts.allowedItems)}

Return { "blocks": [...], "steps": [...] } via submit_block_regen.
`;

  const call = await callJobTool({
    kind: 'page',
    label: `page:${opts.entry.page_id}:blocks`,
    systemPrompt,
    brief: opts.brief,
    userBody: user,
    toolName: 'submit_block_regen',
    toolDescription: 'Submit rewritten blocks (+ optional steps) only.',
    schema: BlockRegenSchema,
    maxTokens: mode === 'guided' ? 6_000 : 4_000,
    guidedPage: mode === 'guided',
    systemModules,
  });

  const softWarnings: string[] = [];
  let parsed = BlockRegenSchema.safeParse(call.data);
  if (!parsed.success) {
    // Tolerate { page: { blocks, steps } } wrappers
    const normalized = normalizePageJson(call.data) as {
      page?: { blocks?: unknown; steps?: unknown };
      blocks?: unknown;
      steps?: unknown;
    };
    const alt = {
      blocks: normalized.blocks ?? normalized.page?.blocks,
      steps: normalized.steps ?? normalized.page?.steps,
    };
    parsed = BlockRegenSchema.safeParse(alt);
  }
  if (!parsed.success) {
    softWarnings.push(
      `block_regen_schema: ${parsed.error.issues[0]?.message ?? 'failed'}`,
    );
    return {
      page: frozen,
      taught_eg: '',
      issues: softWarnings,
      fatals: [],
      warnings: softWarnings.map((m) => ({
        path: opts.entry.page_id,
        rule: 'block_regen',
        message: m,
        tier: 'warning' as const,
      })),
      fixes: [],
      flagged: true,
      retries: 0,
      auto_fix_count: 0,
      timing: call.timing,
      tokens: call.tokens,
      over_budget: call.over_budget,
      model: call.model,
      provider: call.provider,
      attempts: 1,
      userBody: user,
      systemModules,
    };
  }

  let page = mergeBlockRegen(
    frozen,
    { blocks: parsed.data.blocks, steps: parsed.data.steps },
    targets,
  );
  page = hydrateDialogueBlocks(page, bank);
  const guided = reorderGuidedSteps(page);
  page = guided.page;
  softWarnings.push(...guided.warnings);
  softWarnings.push(`block_regen: ${targets.join(',')}`);

  return {
    page,
    taught_eg: '',
    issues: softWarnings,
    fatals: [],
    warnings: softWarnings.map((m) => ({
      path: opts.entry.page_id,
      rule: 'block_regen',
      message: m,
      tier: 'warning' as const,
    })),
    fixes: [
      {
        path: opts.entry.page_id,
        rule: 'block_regen',
        message: `rewrote ${targets.join(',')}`,
        tier: 'fix',
      },
    ],
    flagged: softWarnings.length > 0,
    retries: 0,
    auto_fix_count: targets.length,
    timing: call.timing,
    tokens: call.tokens,
    over_budget: call.over_budget,
    model: call.model,
    provider: call.provider,
    attempts: 1,
    userBody: user,
    systemModules,
  };
}
