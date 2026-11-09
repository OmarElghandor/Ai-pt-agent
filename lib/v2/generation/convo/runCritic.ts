import { z } from 'zod';
import type { ConvoPackData } from '@/lib/v2/convo/pack/schema';
import {
  buildLessonBrief,
  formatLessonBrief,
} from '@/lib/v2/generation/lesson/brief';
import { callJobTool } from '@/lib/v2/generation/lesson/jobs/call';
import { getDayPlan } from '@/lib/v2/generation/lesson/plan';

export const ConvoCriticSchema = z.object({
  patches: z
    .array(
      z.object({
        path: z.string().min(1),
        /** Replacement character tl or coach eg at path. */
        value: z.string().min(1),
        reason: z.string().min(1),
      }),
    )
    .max(12)
    .default([]),
  issues: z
    .array(
      z.object({
        severity: z.enum(['high', 'medium', 'low']),
        path: z.string().optional(),
        message: z.string().min(1),
      }),
    )
    .default([]),
});

export type ConvoCriticResult = z.infer<typeof ConvoCriticSchema>;

/**
 * Critic for conversation packs — patches only (same spirit as lesson critic).
 */
export async function runConvoCriticJob(opts: {
  day: number;
  pack: ConvoPackData;
}): Promise<{
  result: ConvoCriticResult;
  timing: Awaited<ReturnType<typeof callJobTool>>['timing'];
  tokens: Awaited<ReturnType<typeof callJobTool>>['tokens'];
  over_budget: boolean;
  model: string;
  provider: Awaited<ReturnType<typeof callJobTool>>['provider'];
}> {
  const brief = buildLessonBrief(getDayPlan(opts.day));
  const payload = {
    scene: opts.pack.scene,
    groups: opts.pack.groups,
    items: opts.pack.items,
    opening: opts.pack.opening,
    closing: opts.pack.closing,
    bridge: opts.pack.bridge,
    recap: opts.pack.recap,
  };
  const userBody = `STAGE: CONVO_CRITIC
Review this conversation pack. Return patches only (path + replacement value) for Brazilian Portuguese, lines >8 words, coach lines that are not Egyptian, or choice/open rule breaks. Prefer drop-by-empty only via assemble — here rewrite the line.

PACK
${JSON.stringify(payload)}

DAY_BRIEF
${formatLessonBrief(brief)}
`;

  const call = await callJobTool({
    label: 'convo_critic',
    kind: 'convo_critic',
    systemPrompt: `You criticise a Module A conversation pack. Output patches for bad character (pt-PT) or coach (Egyptian) lines. Paths like items.word.left.choice_questions.0.tl. Max 12 patches. No full regen.`,
    brief,
    userBody,
    toolName: 'submit_convo_critic',
    toolDescription: 'Conversation pack critic patches',
    schema: ConvoCriticSchema,
    systemModules: [{ name: 'convo_critic', version: '1' }],
  });

  const parsed = ConvoCriticSchema.safeParse(call.data);
  return {
    result: parsed.success
      ? parsed.data
      : { patches: [], issues: [{ severity: 'low', message: 'critic parse failed' }] },
    timing: call.timing,
    tokens: call.tokens,
    over_budget: call.over_budget,
    model: call.model,
    provider: call.provider,
  };
}

/** Apply string patches at dotted paths into a plain object. */
export function applyConvoPatches(
  pack: ConvoPackData,
  patches: ConvoCriticResult['patches'],
): ConvoPackData {
  const root = structuredClone(pack) as unknown as Record<string, unknown>;
  for (const p of patches) {
    const parts = p.path.split('.').filter(Boolean);
    if (parts.length === 0) continue;
    let cur: Record<string, unknown> = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i]!;
      const next = cur[key];
      if (next == null || typeof next !== 'object') {
        cur = root;
        break;
      }
      cur = next as Record<string, unknown>;
    }
    const last = parts[parts.length - 1]!;
    if (cur && last in cur && typeof cur[last] === 'string') {
      cur[last] = p.value;
    }
  }
  return root as unknown as ConvoPackData;
}
