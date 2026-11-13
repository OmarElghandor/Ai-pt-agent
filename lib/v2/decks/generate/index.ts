import { z } from 'zod';
import {
  callClaudeJson,
  zodToolSchema,
} from '@/lib/generation/claudeClient';
import {
  checkTopicBlocklist,
  TOPIC_REJECT_EG,
} from './blocklist';
import { checkGeneratedWords, type CheckedWord } from './checks';
import {
  GENERATE_SYSTEM,
  buildGenerateUserPrompt,
  buildTopUpUserPrompt,
} from './prompt';
import {
  GenerateDeckOutputSchema,
  TopUpOutputSchema,
  type GenerateDeckOutput,
  type GeneratedWord,
} from './schema';

export type GeneratePhase = 'A1' | 'A2';

export type ModelCallArgs = {
  system: string;
  user: string;
  schema: z.ZodType;
  toolName: string;
  label: string;
};

export type ModelCaller = (
  args: ModelCallArgs,
) => Promise<{ data: unknown; latency_ms: number; usage?: unknown }>;

export type GenerateOk = {
  ok: true;
  topic_ok: true;
  title_tl: string;
  title_ar: string;
  tags: string[];
  words: CheckedWord[];
  dropped_count: number;
  top_up_called: boolean;
  latency_ms: number;
  usage?: unknown;
  model_calls: number;
};

export type GenerateFail = {
  ok: false;
  reason:
    | 'blocklist'
    | 'topic_rejected'
    | 'parse_failed'
    | 'too_few_words'
    | 'empty_topic';
  message_eg: string;
  /** Failed generations do not count against quota. */
  counts_for_quota: false;
  top_up_called?: boolean;
  model_calls?: number;
};

export type GenerateResult = GenerateOk | GenerateFail;

const DEFAULT_MODEL =
  process.env.CUSTOM_DECK_MODEL?.trim() || 'claude-haiku-4-5-20251001';

async function defaultCaller(
  args: ModelCallArgs,
): Promise<{ data: unknown; latency_ms: number; usage?: unknown }> {
  const started = Date.now();
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await callClaudeJson(args.system, args.user, {
        label: args.label,
        model: DEFAULT_MODEL,
        maxTokens: 4096,
        skipProviderFork: true,
        tool: {
          name: args.toolName,
          description: 'Submit the custom deck JSON.',
          inputSchema: zodToolSchema(args.schema),
        },
      });
      return {
        data: result.data,
        latency_ms: Date.now() - started,
        usage: result.usage,
      };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function parseOutput(data: unknown): GenerateDeckOutput | null {
  const parsed = GenerateDeckOutputSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/**
 * Generate + check a custom deck. Injectable model for tests.
 * topic_ok false / blocklist / too few words → no quota burn.
 */
export async function generateCustomDeck(opts: {
  topic: string;
  targetLang?: string;
  phase?: GeneratePhase;
  callModel?: ModelCaller;
}): Promise<GenerateResult> {
  const blocked = checkTopicBlocklist(opts.topic);
  if (!blocked.ok) {
    return {
      ok: false,
      reason: blocked.reason === 'empty' ? 'empty_topic' : 'blocklist',
      message_eg: TOPIC_REJECT_EG,
      counts_for_quota: false,
      model_calls: 0,
    };
  }

  const callModel = opts.callModel ?? defaultCaller;
  const targetLang = opts.targetLang ?? 'pt-PT';
  const phase = opts.phase ?? 'A1';
  let model_calls = 0;
  let latency_ms = 0;
  let usage: unknown;
  let top_up_called = false;

  let raw: GenerateDeckOutput | null = null;
  try {
    const first = await callModel({
      system: GENERATE_SYSTEM,
      user: buildGenerateUserPrompt({
        topic: blocked.topic,
        targetLang,
        phase,
      }),
      schema: GenerateDeckOutputSchema,
      toolName: 'submit_custom_deck',
      label: 'custom_deck_generate',
    });
    model_calls += 1;
    latency_ms += first.latency_ms;
    usage = first.usage;
    raw = parseOutput(first.data);
    if (!raw) {
      // One parse retry (caller may already retry; still try once more at this layer)
      const retry = await callModel({
        system: GENERATE_SYSTEM,
        user: buildGenerateUserPrompt({
          topic: blocked.topic,
          targetLang,
          phase,
        }),
        schema: GenerateDeckOutputSchema,
        toolName: 'submit_custom_deck',
        label: 'custom_deck_generate_retry',
      });
      model_calls += 1;
      latency_ms += retry.latency_ms;
      usage = retry.usage;
      raw = parseOutput(retry.data);
    }
  } catch {
    return {
      ok: false,
      reason: 'parse_failed',
      message_eg: 'مش قدرنا نجهّز الديك دلوقتي، جرّب تاني بعد شوية',
      counts_for_quota: false,
      model_calls,
    };
  }

  if (!raw) {
    return {
      ok: false,
      reason: 'parse_failed',
      message_eg: 'مش قدرنا نجهّز الديك دلوقتي، جرّب تاني بعد شوية',
      counts_for_quota: false,
      model_calls,
    };
  }

  if (!raw.topic_ok) {
    return {
      ok: false,
      reason: 'topic_rejected',
      message_eg: TOPIC_REJECT_EG,
      counts_for_quota: false,
      model_calls,
    };
  }

  let words = raw.words ?? [];
  let { kept, dropped } = checkGeneratedWords(words);

  if (kept.length < 15) {
    top_up_called = true;
    const need = 15 - kept.length;
    try {
      const top = await callModel({
        system: GENERATE_SYSTEM,
        user: buildTopUpUserPrompt({
          topic: blocked.topic,
          need,
          droppedTls: dropped.map((d) => d.word.tl),
          keptLemmas: kept.map((w) => w.lemma),
        }),
        schema: TopUpOutputSchema,
        toolName: 'submit_custom_deck_topup',
        label: 'custom_deck_topup',
      });
      model_calls += 1;
      latency_ms += top.latency_ms;
      const topParsed = TopUpOutputSchema.safeParse(top.data);
      if (topParsed.success) {
        const extra = checkGeneratedWords(
          topParsed.data.words as GeneratedWord[],
        );
        const strip = (w: CheckedWord): GeneratedWord => ({
          tl: w.tl,
          tl_f: w.tl_f,
          pos: w.pos,
          gender: w.gender,
          ar: w.ar,
          eg_note: w.eg_note,
          example_tl: w.example_tl,
          example_ar: w.example_ar,
          concept_en: w.concept_en,
        });
        const merged = checkGeneratedWords([
          ...kept.map(strip),
          ...extra.kept.map(strip),
        ]);
        kept = merged.kept;
        dropped = [...dropped, ...extra.dropped];
      }
    } catch {
      // top-up failure → fall through to too_few check
    }
  }

  if (kept.length < 15) {
    return {
      ok: false,
      reason: 'too_few_words',
      message_eg: 'مش لحقنا نلم كلمات كفاية للموضوع ده، جرّب موضوع تاني',
      counts_for_quota: false,
      top_up_called,
      model_calls,
    };
  }

  return {
    ok: true,
    topic_ok: true,
    title_tl: raw.title_tl?.trim() || blocked.topic,
    title_ar: raw.title_ar?.trim() || blocked.topic,
    tags: (raw.tags ?? []).slice(0, 4),
    words: kept,
    dropped_count: dropped.length,
    top_up_called,
    latency_ms,
    usage,
    model_calls,
  };
}

export { checkGeneratedWords, TOPIC_REJECT_EG, checkTopicBlocklist };
export type { CheckedWord, GeneratedWord };
