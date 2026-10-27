import { z } from 'zod';
import { callClaudeJson, zodToolSchema } from '@/lib/generation/claudeClient';
import type { LessonPack } from '@/lib/v2/content/lesson';
import { formatCompactDayHeader } from '../buildRequest';
import { callTimingFromResult, type CallTiming } from '../cost';
import { getDayPlan } from '../plan';
import { withJsonFooter } from './jsonFooter';
import { buildCachedSystemBlocks } from './sharedPrefix';
import { MAX_TOKENS_CONTINUITY } from './types';

const ContinuitySchema = z.object({
  regenerate: z.array(z.number().int().nonnegative()).default([]),
  notes: z.string().optional(),
});

/** Tool schema without `.default` so required/optional stay clear. */
const ContinuityToolSchema = z.object({
  regenerate: z.array(z.number().int().nonnegative()),
  notes: z.string().optional(),
});

const SUBMIT_CONTINUITY_TOOL = {
  name: 'submit_continuity',
  description: 'Submit continuity review: page indexes to regenerate (or empty).',
  inputSchema: zodToolSchema(ContinuityToolSchema),
};

export type ContinuityResult = z.infer<typeof ContinuitySchema>;

/** Compact lesson summary for the continuity pass (avoid huge payloads). */
function summarizePack(pack: LessonPack): string {
  const pages = pack.pages.map((p, i) => {
    const tips: string[] = [];
    for (const b of p.blocks) {
      if (b.type === 'tip' && 'text' in b) {
        tips.push(JSON.stringify(b.text).slice(0, 120));
      }
      if (b.type === 'examples') {
        tips.push(`examples:${b.items.map((x) => x.ref).join(',')}`);
      }
    }
    const stepTips = (p.steps ?? [])
      .slice(0, 5)
      .map((s) =>
        s.kind === 'reveal' ? JSON.stringify(s.tip).slice(0, 80) : '',
      )
      .filter(Boolean);
    return {
      index: i,
      id: p.id,
      preset: p.preset,
      mode: p.mode,
      title: p.title,
      block_types: p.blocks.map((b) => b.type),
      tips: tips.slice(0, 4),
      step_tips_sample: stepTips,
    };
  });
  return JSON.stringify({ day: pack.lesson.day, pages }, null, 0);
}

export async function runContinuityPass(opts: {
  pack: LessonPack;
}): Promise<{
  result: ContinuityResult;
  timing: CallTiming;
  model: string;
}> {
  const user = withJsonFooter(`STAGE: CONTINUITY PASS
You review one assembled lesson for pedagogy continuity. Return JSON matching:
{ "regenerate": [0, 2], "notes": "optional short note" }

Flag a page index if:
- it repeats the same example or tip almost verbatim as an earlier page
- duplicated tips across pages
- a jump in sequence (assumes knowledge not prepared by prior pages' purposes)

Return at most 3 indexes. Empty regenerate [] means OK. Max one regeneration round will follow.

LESSON SUMMARY:
${summarizePack(opts.pack)}
`);

  console.info(
    `[v2-gen:stage] continuity starting day=${opts.pack.lesson.day} pages=${opts.pack.pages.length}`,
  );

  const dayHeader = formatCompactDayHeader(getDayPlan(opts.pack.lesson.day));

  const result = await callClaudeJson('', user, {
    label: 'continuity',
    maxTokens: MAX_TOKENS_CONTINUITY,
    systemBlocks: buildCachedSystemBlocks({
      items: opts.pack.items,
      dayHeader,
    }),
    tool: SUBMIT_CONTINUITY_TOOL,
  });

  const parsed = ContinuitySchema.safeParse(result.data);
  if (!parsed.success) {
    return {
      result: { regenerate: [], notes: `parse_failed: ${parsed.error.message}` },
      timing: callTimingFromResult({
        label: 'continuity',
        durationMs: result.durationMs,
        usage: result.usage,
      }),
      model: result.model,
    };
  }

  const max = opts.pack.pages.length - 1;
  const regenerate = [...new Set(parsed.data.regenerate)].filter(
    (i) => i >= 0 && i <= max,
  );

  return {
    result: { regenerate, notes: parsed.data.notes },
    timing: callTimingFromResult({
      label: 'continuity',
      durationMs: result.durationMs,
      usage: result.usage,
    }),
    model: result.model,
  };
}
