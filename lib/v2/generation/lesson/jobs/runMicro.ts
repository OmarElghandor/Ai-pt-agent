import { z } from 'zod';
import {
  MicroDrillSchema,
  MicroNoticeOptionSchema,
  type Micro,
} from '@/lib/v2/content/lesson';
import type { Item } from '@/lib/v2/content/items';
import type { LessonBrief } from '../brief';
import { getDayPlan } from '../plan';
import { buildMicroSystemPrompt } from '../prompts';
import { wordCount } from '../prompts/core';
import { callJobTool } from './call';

const ARABIC_RE = /[\u0600-\u06FF]/

/** Replace Arabic option texts with canonical item.ar when they match a bank meaning. */
function alignMeaningsFromItems(
  options: { text: string; correct: boolean }[],
  items: Item[],
): { text: string; correct: boolean }[] {
  const arByNorm = new Map<string, string>();
  for (const it of items) {
    if ('ar' in it && typeof it.ar === 'string' && it.ar.trim()) {
      arByNorm.set(it.ar.replace(/\s+/g, ''), it.ar.trim());
    }
  }
  return options.map((o) => {
    if (!ARABIC_RE.test(o.text)) return o;
    const key = o.text.replace(/\s+/g, '');
    const canonical = arByNorm.get(key);
    if (canonical) return { ...o, text: canonical };
    // Fuzzy: if option looks like a retyped meaning of a known ar, prefer item.ar
    for (const [norm, ar] of arByNorm) {
      if (
        norm.length >= 3 &&
        (key.includes(norm) || norm.includes(key)) &&
        Math.abs(norm.length - key.length) <= 4
      ) {
        return { ...o, text: ar };
      }
    }
    return o;
  });
}

function forceMeaningsFromLinkedItems(
  micro: Micro,
  items: Item[],
): Micro {
  const linkedIds = new Set<string>([
    micro.morning.phrase,
    ...micro.tool.examples,
  ]);
  const linked = items.filter((i) => linkedIds.has(i.id));
  const bank = linked.length ? linked : items;
  const noticeOpts = alignMeaningsFromItems(
    micro.tool.notice.options,
    bank,
  );
  const drills = micro.tool.drills.map((d) => {
    if (typeof d === 'string') return d;
    if (!d || typeof d !== 'object') return d;
    const opts = Array.isArray(d.options)
      ? alignMeaningsFromItems(
          d.options as { text: string; correct: boolean }[],
          bank,
        )
      : d.options;
    return { ...d, options: opts };
  });
  return {
    ...micro,
    tool: {
      ...micro.tool,
      notice: { ...micro.tool.notice, options: noticeOpts },
      drills,
    },
  };
}

export const MicroJobSchema = z.object({
  micro: z.object({
    morning: z.object({
      phrase: z.string(),
      mission_eg: z.string(),
    }),
    tool: z.object({
      tool_id: z.string(),
      step: z.number().int().positive(),
      of: z.number().int().positive(),
      builds_on_eg: z.string(),
      examples: z.array(z.string()).min(1),
      notice: z.object({
        question_eg: z.string(),
        options: z.array(MicroNoticeOptionSchema).min(3).max(3),
      }),
      rule_eg: z.string(),
      drills: z.array(MicroDrillSchema).min(2).max(2),
    }),
    evening: z.object({
      teaser_eg: z.string(),
    }),
  }),
});

export async function runMicroJob(opts: {
  brief: LessonBrief;
  items: Item[];
  phraseDigest?: { id: string; tl: string }[];
  prevMicroHandoff?: { series: string; step: number; examples_used: string[] } | null;
}): Promise<{
  micro: Micro;
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
  const micro = gen.micro_step;
  const microLine = micro
    ? `MICRO_STEP: ${micro.series} · step ${micro.step} of ${micro.of} · previous: ${micro.previous ?? 'none'} · today: ${micro.today}`
    : 'MICRO_STEP: (none)';
  const tomorrow = gen.tomorrow
    ? `tomorrow: ${gen.tomorrow.tl} · ${gen.tomorrow.eg}`
    : 'tomorrow: (next day)';
  const phrases =
    opts.phraseDigest ??
    opts.items
      .filter((i) => i.type === 'phrase' || i.type === 'sentence')
      .map((i) => ({
        id: i.id,
        tl: 'tl' in i && typeof i.tl === 'string' ? i.tl : '',
      }));
  const prev =
    opts.prevMicroHandoff &&
    micro &&
    opts.prevMicroHandoff.series === micro.series
      ? JSON.stringify(opts.prevMicroHandoff)
      : '(none)';

  const user = `STAGE: MICRO ONLY
Return { "micro": {...} } via submit_micro.
${microLine}
${tomorrow}
PREV_MICRO_HANDOFF (same series): ${prev}
PHRASE_DIGEST: ${JSON.stringify(phrases)}
drills must be 2 full quiz objects (prompt + options), not question ids.
`;

  const systemModules = [
    { name: 'core', version: '1' },
    { name: 'micro', version: '1' },
  ];

  const first = await callJobTool({
    kind: 'micro',
    label: 'micro',
    systemPrompt: buildMicroSystemPrompt(),
    brief: opts.brief,
    userBody: user,
    toolName: 'submit_micro',
    toolDescription: 'Submit micro morning/tool/evening units.',
    schema: MicroJobSchema,
    systemModules,
  });

  let parsed = MicroJobSchema.safeParse(first.data);
  let call = first;
  if (!parsed.success) {
    call = await callJobTool({
      kind: 'micro',
      label: 'micro:retry',
      systemPrompt: buildMicroSystemPrompt(),
      brief: opts.brief,
      userBody: `${user}\n\nPREVIOUS ERROR:\n${parsed.error.message}`,
      toolName: 'submit_micro',
      toolDescription: 'Submit micro morning/tool/evening units.',
      schema: MicroJobSchema,
    });
    parsed = MicroJobSchema.safeParse(call.data);
    if (!parsed.success) {
      throw new Error(`Micro schema failed: ${parsed.error.message}`);
    }
  }

  let result = parsed.data.micro as Micro;
  const issues: string[] = [];
  const ids = new Set(opts.items.map((i) => i.id));
  if (!ids.has(result.morning.phrase)) {
    issues.push(`micro.morning.phrase unknown: ${result.morning.phrase}`);
  }
  const missionWords = wordCount(result.morning.mission_eg);
  if (missionWords > 25) {
    issues.push(
      `mission_eg has ${missionWords} words (max 25)`,
    );
    // Truncate to 25 words so pack still validates
    result = {
      ...result,
      morning: {
        ...result.morning,
        mission_eg: result.morning.mission_eg
          .trim()
          .split(/\s+/)
          .slice(0, 25)
          .join(' '),
      },
    };
  }
  const correct = result.tool.notice.options.filter((o) => o.correct).length;
  if (correct !== 1) {
    issues.push(`notice needs exactly one correct, got ${correct}`);
  }
  result = forceMeaningsFromLinkedItems(result, opts.items);

  return {
    micro: result,
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
