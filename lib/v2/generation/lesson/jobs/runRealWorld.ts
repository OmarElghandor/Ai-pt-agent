import { z } from 'zod';
import type { Item } from '@/lib/v2/content/items';
import type { LessonBrief } from '../brief';
import { getDayPlan } from '../plan';
import { buildRealWorldSystemPrompt } from '../prompts';
import {
  processRealWorldPhrases,
  type RealWorldHandoff,
  type RealWorldPhraseRaw,
  type RealWorldTipRaw,
} from '../realWorldBuild';
import { callJobTool } from './call';

export const RealWorldToolSchema = z.object({
  phrases: z
    .array(
      z.object({
        tl: z.string().min(1),
        tl_f: z.string().optional(),
        ar: z.string().min(1),
        eg_note: z.string().min(1),
        tag: z.string().min(1),
      }),
    )
    .min(3)
    .max(6),
  tip: z.object({
    title_eg: z.string().min(1),
    wrong_tl: z.string().min(1),
    right_tl: z.string().min(1),
    body_eg: z.string().min(1),
  }),
});

const DEFAULT_TIP: RealWorldTipRaw = {
  title_eg: 'نصيحة',
  wrong_tl: 'Quero',
  right_tl: 'Queria',
  body_eg: 'دي المهذبة في البرتغال.',
};

function extractGrammarTl(brief: LessonBrief): string | undefined {
  const m = brief.grammar_focus.match(/^([^\s—]+)/);
  return m?.[1];
}

export async function runRealWorldJob(opts: {
  brief: LessonBrief;
  items: Item[];
}): Promise<{
  handoff: RealWorldHandoff;
  skipped: boolean;
  issues: string[];
  timing: Awaited<ReturnType<typeof callJobTool>>['timing'] | null;
  tokens: Awaited<ReturnType<typeof callJobTool>>['tokens'] | null;
  over_budget: boolean;
  model: string;
  provider: Awaited<ReturnType<typeof callJobTool>>['provider'] | null;
  userBody: string;
  systemModules: { name: string; version: string }[];
}> {
  const dayPlan = getDayPlan(opts.brief.day);
  const systemModules = [
    { name: 'core', version: '1' },
    { name: 'realWorld', version: '1' },
  ];

  // Weekly story days: no detail pages → skip
  if (dayPlan.is_story) {
    return {
      handoff: {
        phrases: [],
        tip: DEFAULT_TIP,
        hide: true,
        issues: ['skipped — weekly story day'],
        authored: false,
      },
      skipped: true,
      issues: ['skipped — weekly story day'],
      timing: null,
      tokens: null,
      over_budget: false,
      model: 'none',
      provider: null,
      userBody: '',
      systemModules,
    };
  }

  const coreTls = opts.brief.core_items.map((c) => c.tl);
  const itemDigest = opts.items.map((i) => ({
    id: i.id,
    type: i.type,
    tl: 'tl' in i && typeof i.tl === 'string' ? i.tl : '',
  }));

  // Authored override — skip model call
  if (opts.brief.authored_real_world?.length) {
    const handoff = processRealWorldPhrases({
      raw: opts.brief.authored_real_world as RealWorldPhraseRaw[],
      tip: DEFAULT_TIP,
      items: itemDigest,
      coreTls,
      maxWords: opts.brief.max_words,
      grammarFocusTl: extractGrammarTl(opts.brief),
      authored: true,
    });
    return {
      handoff,
      skipped: handoff.hide,
      issues: handoff.issues,
      timing: null,
      tokens: null,
      over_budget: false,
      model: 'authored',
      provider: null,
      userBody: '(authored real_world from core-items)',
      systemModules,
    };
  }

  const user = `STAGE: REAL_WORLD ONLY
Return { "phrases": [...], "tip": {...} } via submit_real_world.
Write 4–5 Lisbon café/street phrases for THIS situation — beyond CORE items.

SITUATION: ${opts.brief.situation_eg}
TITLE: ${opts.brief.title_tl} / ${opts.brief.title_ar}
GRAMMAR: ${opts.brief.grammar_focus}
MAX_WORDS per phrase: ${opts.brief.max_words + 4} (phase max ${opts.brief.max_words} + 4)

CORE_ITEMS:
${opts.brief.core_items.map((c) => `- ${c.id}: ${c.tl} (${c.eg})`).join('\n')}

ITEM_DIGEST (known today):
${JSON.stringify(itemDigest)}
`;

  const emptyTiming = {
    label: 'real_world',
    duration_ms: 0,
    input_tokens: 0,
    output_tokens: 0,
    usd_estimate: 0,
  };
  const emptyTokens = { system: 0, input: 0, output: 0 };

  let call: Awaited<ReturnType<typeof callJobTool>>;
  try {
    call = await callJobTool({
      kind: 'real_world',
      label: 'real_world',
      systemPrompt: buildRealWorldSystemPrompt(),
      brief: opts.brief,
      userBody: user,
      toolName: 'submit_real_world',
      toolDescription: 'Submit real-world phrases and one tip.',
      schema: RealWorldToolSchema,
      systemModules,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      handoff: {
        phrases: [],
        tip: DEFAULT_TIP,
        hide: true,
        issues: [`model call failed: ${msg}`],
        authored: false,
      },
      skipped: true,
      issues: [`model call failed: ${msg}`],
      timing: emptyTiming,
      tokens: emptyTokens,
      over_budget: false,
      model: 'error',
      provider: null,
      userBody: user,
      systemModules,
    };
  }

  let parsed = RealWorldToolSchema.safeParse(call.data);
  if (!parsed.success) {
    try {
      call = await callJobTool({
        kind: 'real_world',
        label: 'real_world:retry',
        systemPrompt: buildRealWorldSystemPrompt(),
        brief: opts.brief,
        userBody: `${user}\n\nPREVIOUS ERROR:\n${parsed.error.message}`,
        toolName: 'submit_real_world',
        toolDescription: 'Submit real-world phrases and one tip.',
        schema: RealWorldToolSchema,
        systemModules,
      });
      parsed = RealWorldToolSchema.safeParse(call.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        handoff: {
          phrases: [],
          tip: DEFAULT_TIP,
          hide: true,
          issues: [`retry failed: ${msg}`],
          authored: false,
        },
        skipped: true,
        issues: [`retry failed: ${msg}`],
        timing: call.timing,
        tokens: call.tokens,
        over_budget: call.over_budget,
        model: call.model,
        provider: call.provider,
        userBody: user,
        systemModules,
      };
    }
  }

  if (!parsed.success) {
    return {
      handoff: {
        phrases: [],
        tip: DEFAULT_TIP,
        hide: true,
        issues: [`schema failed: ${parsed.error.message}`],
        authored: false,
      },
      skipped: true,
      issues: [`schema failed: ${parsed.error.message}`],
      timing: call.timing,
      tokens: call.tokens,
      over_budget: call.over_budget,
      model: call.model,
      provider: call.provider,
      userBody: user,
      systemModules,
    };
  }

  const tip: RealWorldTipRaw = parsed.data.tip ?? DEFAULT_TIP;
  const handoff = processRealWorldPhrases({
    raw: parsed.data.phrases,
    tip,
    items: itemDigest,
    coreTls,
    maxWords: opts.brief.max_words,
    grammarFocusTl: extractGrammarTl(opts.brief),
  });

  return {
    handoff,
    skipped: handoff.hide,
    issues: handoff.issues,
    timing: call.timing,
    tokens: call.tokens,
    over_budget: call.over_budget,
    model: call.model,
    provider: call.provider,
    userBody: user,
    systemModules,
  };
}
