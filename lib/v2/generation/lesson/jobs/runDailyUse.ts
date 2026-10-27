import { z } from 'zod';
import { SpeakPromptSchema, type SpeakPrompt } from '@/lib/v2/content/lesson';
import type { Item } from '@/lib/v2/content/items';
import type { LessonBrief } from '../brief';
import { getDayPlan } from '../plan';
import { buildDailyUseSystemPrompt } from '../prompts';
import { callJobTool } from './call';

export const DailyUseSchema = z.object({
  speak_prompts: z.array(SpeakPromptSchema).min(3).max(4),
  can_do: z
    .array(
      z.object({
        eg: z.string(),
        proves: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

export async function runDailyUseJob(opts: {
  brief: LessonBrief;
  items: Item[];
  itemDigest?: { id: string; tl: string; role: 'new' | 'recycle' }[];
}): Promise<{
  speak_prompts: SpeakPrompt[];
  can_do?: { eg: string; proves?: string[] }[];
  issues: string[];
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
  const recycle = new Set(gen.recycle ?? []);
  const digest =
    opts.itemDigest ??
    opts.items.map((i) => ({
      id: i.id,
      tl: 'tl' in i && typeof i.tl === 'string' ? i.tl : '',
      role: recycle.has(i.id) ? ('recycle' as const) : ('new' as const),
    }));

  const user = `STAGE: DAILY USE ONLY
Return { "speak_prompts": [...], "can_do": [...]? } via submit_daily_use.

NEW_AND_RECYCLE_DIGEST:
${JSON.stringify(digest)}
`;

  const systemModules = [
    { name: 'core', version: '1' },
    { name: 'dailyUse', version: '1' },
  ];

  const first = await callJobTool({
    kind: 'daily_use',
    label: 'daily_use',
    systemPrompt: buildDailyUseSystemPrompt(),
    brief: opts.brief,
    userBody: user,
    toolName: 'submit_daily_use',
    toolDescription: 'Submit speak_prompts and optional can_do.',
    schema: DailyUseSchema,
    systemModules,
  });

  let parsed = DailyUseSchema.safeParse(first.data);
  let call = first;
  if (!parsed.success) {
    call = await callJobTool({
      kind: 'daily_use',
      label: 'daily_use:retry',
      systemPrompt: buildDailyUseSystemPrompt(),
      brief: opts.brief,
      userBody: `${user}\n\nPREVIOUS ERROR:\n${parsed.error.message}`,
      toolName: 'submit_daily_use',
      toolDescription: 'Submit speak_prompts and optional can_do.',
      schema: DailyUseSchema,
    });
    parsed = DailyUseSchema.safeParse(call.data);
    if (!parsed.success) {
      throw new Error(`Daily use schema failed: ${parsed.error.message}`);
    }
  }

  const ids = new Set(opts.items.map((i) => i.id));
  const issues: string[] = [];
  for (const [si, sp] of parsed.data.speak_prompts.entries()) {
    for (const id of sp.ids) {
      if (!ids.has(id) && !id.startsWith('verb.')) {
        issues.push(`speak_prompts[${si}] unknown id ${id}`);
      }
    }
  }

  return {
    speak_prompts: parsed.data.speak_prompts,
    can_do: parsed.data.can_do,
    issues,
    timing: call.timing,
    tokens: call.tokens,
    over_budget: call.over_budget,
    model: call.model,
    provider: call.provider,
    userBody: user,
    systemModules,
  };
}
