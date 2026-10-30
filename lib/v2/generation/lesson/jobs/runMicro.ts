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

/** Portuguese number words blocked before day 4 (plus digit tokens). */
const NUMBER_WORDS = new Set([
  'zero',
  'um',
  'uma',
  'dois',
  'duas',
  'três',
  'tres',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
  'dez',
  'onze',
  'doze',
  'treze',
  'quatorze',
  'catorze',
  'quinze',
  'vinte',
  'trinta',
  'quarenta',
  'cinquenta',
  'sessenta',
  'setenta',
  'oitenta',
  'noventa',
  'cem',
  'cento',
  'euro',
  'euros',
]);

function tokenizeTl(tl: string): string[] {
  return tl
    .replace(/[…]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[,.;:!?«»"']+|[,.;:!?«»"']+$/g, ''))
    .filter(Boolean);
}

/** True when MICRO_STEP.today needs material not yet taught (numbers/quantity). */
export function microStepNeedsUnknown(
  today: string | undefined,
  day: number,
): boolean {
  if (!today) return false;
  if (day >= 4) return false;
  return /quantit|number|dois|duas|três|numeral|\d/i.test(today);
}

function collectMicroTl(micro: Micro, items: Item[]): string[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const texts: string[] = [];
  for (const id of micro.tool.examples) {
    const it = byId.get(id);
    if (it && 'tl' in it && typeof it.tl === 'string') texts.push(it.tl);
  }
  for (const d of micro.tool.drills) {
    if (typeof d === 'string') continue;
    if (d && typeof d === 'object') {
      const p = d.prompt;
      if (typeof p === 'string') texts.push(p);
      else if (Array.isArray(p)) {
        texts.push(
          p
            .map((s) =>
              s && typeof s === 'object' && 'text' in s
                ? String((s as { text: unknown }).text)
                : '',
            )
            .join(''),
        );
      }
      if (Array.isArray(d.options)) {
        for (const o of d.options) {
          if (o && typeof o === 'object' && 'text' in o) {
            texts.push(String((o as { text: unknown }).text ?? ''));
          }
        }
      }
    }
  }
  return texts;
}

function hasForbiddenNumberToken(text: string, day: number): string | null {
  if (day >= 4) return null;
  for (const tok of tokenizeTl(text)) {
    if (/^\d+([.,]\d+)?$/.test(tok)) return tok;
    const lower = tok.toLowerCase();
    // um/uma are also indefinite articles — allow when used as articles via FUNCTION_WORDS
    if (lower === 'um' || lower === 'uma') continue;
    if (NUMBER_WORDS.has(lower)) return tok;
  }
  return null;
}

function saidPhraseIds(items: Item[]): string[] {
  return items
    .filter((i) => {
      if (i.type !== 'phrase') return false;
      if ((i as { derived?: boolean }).derived) return false;
      if (/^pattern\..+\.ex\.\d+$/.test(i.id)) return false;
      const role = (i as { role?: string }).role;
      return role !== 'heard';
    })
    .map((i) => i.id);
}

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
  const fallbackToday =
    micro && microStepNeedsUnknown(micro.today, opts.brief.day)
      ? `${micro.previous ?? 'Queria + thing'} with today's nouns (no numbers yet)`
      : micro?.today;
  const microLine = micro
    ? `MICRO_STEP: ${micro.series} · step ${micro.step} of ${micro.of} · previous: ${micro.previous ?? 'none'} · today: ${fallbackToday}`
    : 'MICRO_STEP: (none)';
  const tomorrow = gen.tomorrow
    ? `tomorrow: ${gen.tomorrow.tl} · ${gen.tomorrow.eg}`
    : 'tomorrow: (next day)';
  const saidIds = saidPhraseIds(opts.items);
  const phrases =
    opts.phraseDigest ??
    opts.items
      .filter((i) => i.type === 'phrase' || i.type === 'sentence')
      .map((i) => ({
        id: i.id,
        tl: 'tl' in i && typeof i.tl === 'string' ? i.tl : '',
        role:
          i.type === 'phrase'
            ? ((i as { role?: string }).role ?? 'said')
            : undefined,
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
SAID_PHRASE_IDS (morning.phrase MUST be one of these): ${JSON.stringify(saidIds)}
Day ${opts.brief.day}: ${opts.brief.day < 4 ? 'NO number words or digits in tool TL.' : 'numbers allowed.'}
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
  const said = new Set(saidPhraseIds(opts.items));
  if (!ids.has(result.morning.phrase)) {
    issues.push(`micro.morning.phrase unknown: ${result.morning.phrase}`);
  } else if (said.size && !said.has(result.morning.phrase)) {
    issues.push(
      `micro.morning.phrase must be a today's said phrase, got ${result.morning.phrase}`,
    );
    // Auto-fix to first said phrase
    const fallback = [...said][0];
    if (fallback) {
      result = {
        ...result,
        morning: { ...result.morning, phrase: fallback },
      };
      issues.push(`auto-fixed morning.phrase → ${fallback}`);
    }
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

  // Number gate on tool TL surfaces
  for (const text of collectMicroTl(result, opts.items)) {
    const bad = hasForbiddenNumberToken(text, opts.brief.day);
    if (bad) {
      issues.push(
        `micro tool TL has number token "${bad}" before day 4`,
      );
    }
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
