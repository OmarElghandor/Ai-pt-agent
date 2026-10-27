import { z } from 'zod';
import type { LessonBrief } from '../brief';
import type { PageDigest } from '../handoffs';
import { buildContinuitySystemPrompt } from '../prompts';
import { callJobTool } from './call';

export const ContinuityToolSchema = z.object({
  regenerate: z.array(z.number().int().nonnegative()),
  notes: z.string().optional(),
});

export async function runContinuityJob(opts: {
  brief: LessonBrief;
  pageDigests: PageDigest[];
  regenRound: number;
}): Promise<{
  regenerate: number[];
  notes?: string;
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
    { name: 'continuity', version: '1' },
  ];

  if (opts.regenRound >= 1) {
    return {
      regenerate: [],
      notes: 'regen_round already used; skip',
      timing: {
        label: 'continuity',
        duration_ms: 0,
        input_tokens: 0,
        output_tokens: 0,
        usd_estimate: 0,
      },
      tokens: { system: 0, input: 0, output: 0 },
      over_budget: false,
      model: 'n/a',
      provider: 'anthropic',
      userBody: '(skipped)',
      systemModules,
    };
  }

  const user = `STAGE: CONTINUITY
Return { "regenerate": [...], "notes": "..."? } via submit_continuity.
At most 3 indexes. Empty [] means OK.
Use only the page digests below — never invent full page JSON.

PAGE_DIGESTS:
${JSON.stringify(opts.pageDigests)}
`;

  const call = await callJobTool({
    kind: 'continuity',
    label: 'continuity',
    systemPrompt: buildContinuitySystemPrompt(),
    brief: opts.brief,
    userBody: user,
    toolName: 'submit_continuity',
    toolDescription: 'Submit page indexes to regenerate.',
    schema: ContinuityToolSchema,
    systemModules,
  });

  const parsed = ContinuityToolSchema.safeParse(call.data);
  if (!parsed.success) {
    return {
      regenerate: [],
      notes: `parse_failed: ${parsed.error.message}`,
      timing: call.timing,
      tokens: call.tokens,
      over_budget: call.over_budget,
      model: call.model,
      provider: call.provider,
      userBody: user,
      systemModules,
    };
  }

  const max = opts.pageDigests.length - 1;
  const regenerate = [...new Set(parsed.data.regenerate)]
    .filter((i) => i >= 0 && i <= max)
    .slice(0, 3);

  // Code: same tip_head on ≥2 pages → flag those indexes
  const tipToPages = new Map<string, number[]>();
  for (const d of opts.pageDigests) {
    for (const tip of d.tip_heads ?? []) {
      const key = tip.trim().toLowerCase();
      if (!key) continue;
      const list = tipToPages.get(key) ?? [];
      list.push(d.index);
      tipToPages.set(key, list);
    }
  }
  const tipDupes: number[] = [];
  for (const indexes of tipToPages.values()) {
    if (indexes.length >= 2) tipDupes.push(...indexes);
  }
  const merged = [...new Set([...regenerate, ...tipDupes])]
    .filter((i) => i >= 0 && i <= max)
    .slice(0, 3);
  const notes =
    tipDupes.length > 0
      ? `${parsed.data.notes ?? ''} · duplicate tips on pages ${[...new Set(tipDupes)].join(',')}`.trim()
      : parsed.data.notes;

  return {
    regenerate: merged,
    notes,
    timing: call.timing,
    tokens: call.tokens,
    over_budget: call.over_budget,
    model: call.model,
    provider: call.provider,
    userBody: user,
    systemModules,
  };
}
