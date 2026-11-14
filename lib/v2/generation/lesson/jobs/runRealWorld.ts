import { z } from 'zod';
import type { Item } from '@/lib/v2/content/items';
import type { LessonBrief } from '../brief';
import { getDayPlan } from '../plan';
import { buildRealWorldSystemPrompt } from '../prompts';
import {
  EMPTY_TIP,
  processRealWorldPhrases,
  tipFitsSituation,
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
        uses: z.array(z.string().min(1)).min(1),
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

/** Neutral placeholder — never ship Quero/Queria as a default on non-ordering days. */
const DEFAULT_TIP: RealWorldTipRaw = EMPTY_TIP;

const TipOnlyToolSchema = z.object({
  tip: z.object({
    title_eg: z.string().min(1),
    wrong_tl: z.string().min(1),
    right_tl: z.string().min(1),
    body_eg: z.string().min(1),
  }),
});

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
  const seenDigest = new Set<string>();
  const itemDigest: Array<{ id: string; type?: string; tl?: string }> = [];
  for (const i of opts.items) {
    if (seenDigest.has(i.id)) continue;
    seenDigest.add(i.id);
    itemDigest.push({
      id: i.id,
      type: i.type,
      tl: 'tl' in i && typeof i.tl === 'string' ? i.tl : '',
    });
  }
  // Core ids always count for uses[] even if not yet in the item bank.
  for (const c of opts.brief.core_items) {
    if (seenDigest.has(c.id)) continue;
    seenDigest.add(c.id);
    itemDigest.push({ id: c.id, type: c.kind, tl: c.tl });
  }

  const situationOpts = {
    situationEg: opts.brief.situation_eg,
    situationTl: dayPlan.generation?.situation_tl,
    titleTl: opts.brief.title_tl,
  };

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
      ...situationOpts,
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
Write 4–5 phrases people really say in THIS situation in Lisbon — beyond CORE items.
The tip MUST be about today's situation only (never Quero→Queria unless today is ordering).

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

  let tip: RealWorldTipRaw = parsed.data.tip ?? DEFAULT_TIP;
  const phraseTls = parsed.data.phrases.map((p) => p.tl);
  let tipFit = tipFitsSituation(tip, {
    coreTls,
    phraseTls,
    situationEg: opts.brief.situation_eg,
    grammarFocus: opts.brief.grammar_focus,
  });

  // One tip-only retry when the tip is about the wrong situation.
  if (!tipFit.ok) {
    try {
      const tipRetry = await callJobTool({
        kind: 'real_world',
        label: 'real_world:tip_retry',
        systemPrompt: buildRealWorldSystemPrompt(),
        brief: opts.brief,
        userBody: `${user}

TIP ONLY RETRY: previous tip was rejected (${tipFit.reason}).
Return a tip about TODAY's situation and phrases only via submit_real_world tip field.
Do NOT use Quero/Queria unless today's CORE is about ordering.
Previous tip: ${JSON.stringify(tip)}
Today phrases: ${JSON.stringify(phraseTls)}`,
        toolName: 'submit_real_world',
        toolDescription: 'Submit a tip that matches today situation.',
        schema: TipOnlyToolSchema,
        systemModules,
      });
      const tipParsed = TipOnlyToolSchema.safeParse(tipRetry.data);
      if (tipParsed.success) {
        tip = tipParsed.data.tip;
        tipFit = tipFitsSituation(tip, {
          coreTls,
          phraseTls,
          situationEg: opts.brief.situation_eg,
          grammarFocus: opts.brief.grammar_focus,
        });
      }
    } catch {
      // drop tip below
    }
  }

  const handoff = processRealWorldPhrases({
    raw: parsed.data.phrases,
    tip,
    items: itemDigest,
    coreTls,
    maxWords: opts.brief.max_words,
    grammarFocusTl: extractGrammarTl(opts.brief),
    ...situationOpts,
    keepTip: tipFit.ok,
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
