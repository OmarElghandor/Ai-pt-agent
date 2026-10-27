import { z } from 'zod';
import type { Page } from '@/lib/v2/content/page';
import type { Item } from '@/lib/v2/content/items';
import type { LessonBrief } from '../brief';
import type { OutlinePagePlan } from '../stages/types';
import type { Preset } from '@/lib/v2/content/page';
import { filterCriticIssues } from '../criticFilter';
import { checkDialoguePage } from '../dialogueChecks';
import { buildCriticSystemPrompt } from '../prompts/critic';
import { PRESET_CATALOGS } from '../prompts/pageCatalog';
import { callJobTool } from './call';

export const CriticSchema = z.object({
  issues: z.array(
    z.object({
      severity: z.enum(['high', 'medium', 'low']),
      path: z.string().optional(),
      message: z.string().min(1),
    }),
  ),
});

export type CriticIssue = z.infer<typeof CriticSchema>['issues'][number];

export async function runCriticJob(opts: {
  brief: LessonBrief;
  entry: OutlinePagePlan;
  page: Page;
  allowedItems: Item[];
  /** Full day bank for dialogue token / id checks (defaults to allowedItems). */
  allItems?: Item[];
}): Promise<{
  issues: CriticIssue[];
  high: CriticIssue[];
  timing: Awaited<ReturnType<typeof callJobTool>>['timing'];
  tokens: Awaited<ReturnType<typeof callJobTool>>['tokens'];
  over_budget: boolean;
  model: string;
  provider: Awaited<ReturnType<typeof callJobTool>>['provider'];
  userBody: string;
  systemModules: { name: string; version: string }[];
}> {
  const systemModules = [
    { name: 'core', version: '1' },
    { name: 'critic', version: '1' },
  ];
  const preset = opts.entry.preset as Preset;
  const mode = opts.entry.mode ?? opts.page.mode;
  const catalog = PRESET_CATALOGS[preset];
  const user = `STAGE: CRITIC
Review this page only.

PLAN:
${JSON.stringify(opts.entry)}

PRESET PAGE CONTRACT (${preset}):
blocks — ${catalog?.blocks ?? '(unknown)'}
targets — ${catalog?.targets ?? ''}

ALLOWED ITEMS (full):
${JSON.stringify(opts.allowedItems)}

PAGE JSON:
${JSON.stringify(opts.page)}

Return { "issues": [...] } via submit_critic.
Keep issues ≤8. Short messages. Call the tool once — no prose.
Do NOT flag پ/ڤ/چ/غ in say, or legal bN/… targets, as errors.
`;

  let call: Awaited<ReturnType<typeof callJobTool>>;
  try {
    call = await callJobTool({
      kind: 'critic',
      label: `critic:${opts.entry.page_id}`,
      systemPrompt: buildCriticSystemPrompt(preset, mode),
      brief: opts.brief,
      userBody: user,
      toolName: 'submit_critic',
      toolDescription: 'Submit page critic issues.',
      schema: CriticSchema,
      maxTokens: 2_048,
      systemModules,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[v2-gen:critic] page=${opts.entry.page_id} skipped: ${msg}`,
    );
    return {
      issues: [],
      high: [],
      timing: {
        label: `critic:${opts.entry.page_id}`,
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

  const parsed = CriticSchema.safeParse(call.data);
  if (!parsed.success) {
    return {
      issues: [],
      high: [],
      timing: call.timing,
      tokens: call.tokens,
      over_budget: call.over_budget,
      model: call.model,
      provider: call.provider,
      userBody: user,
      systemModules,
    };
  }

  const raw = parsed.data.issues.slice(0, 8);
  const filtered = filterCriticIssues(raw, {
    preset,
    page: opts.page,
  });
  if (filtered.dropped.length) {
    console.info(
      `[v2-gen:critic] page=${opts.entry.page_id} dropped=${filtered.dropped.length} kept=${filtered.kept.length}`,
    );
  }
  const dialogueIssues = checkDialoguePage({
    page: opts.page,
    items: opts.allItems ?? opts.allowedItems,
    recycleIds: opts.brief.recycle_ids,
    maxWords: opts.brief.max_words,
    day: opts.brief.day,
    chatCharacter: opts.brief.chat_character,
  });
  const kept = [...filtered.kept, ...dialogueIssues].slice(0, 12);
  const high = kept.filter((i) => i.severity === 'high');
  return {
    issues: kept,
    high,
    timing: call.timing,
    tokens: call.tokens,
    over_budget: call.over_budget,
    model: call.model,
    provider: call.provider,
    userBody: user,
    systemModules,
  };
}
