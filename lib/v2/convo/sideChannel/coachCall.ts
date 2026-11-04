import { generateText } from 'ai';
import { getChatModel } from '@/lib/model';

export const COACH_CALL_TIMEOUT_MS = 4_000;

export const COACH_CALL_FALLBACK_EG =
  'جرّب تقولها بالبرتغالي — لو مش متأكد، اسأل تاني بجملة أقصر';

/** Fixed Egyptian coach system prompt (09 §6). Never sees the character prompt. */
export const COACH_SIDE_SYSTEM = [
  'أنت كوتش مصري بتساعد متعلم برتغالي أوروبي (pt-PT) في لشبونة.',
  'جاوب بالعامية المصرية في سطر أو سطرين فقط.',
  'لو سأل ازاي يقول حاجة، ادّي الصيغة البرتغالية القصيرة المناسبة لمستوى مبتدئ.',
  'اختم دايماً بجملة: جرّب تقولها',
  'ما تتكلمش برتغالي في شرحك إلا الكلمة/الجملة المطلوبة.',
  'ما تشرحش قواعد، وما تطوّلش.',
].join('\n');

export type CoachCallInput = {
  learnerQuestion: string;
  /** Current pack item ids with tl surfaces (context only). */
  itemHints: Array<{ id: string; tl: string }>;
};

export type CoachCallResult = {
  eg: string;
  timedOut: boolean;
  error?: string;
};

export type ConvoCoachCaller = (
  input: CoachCallInput,
) => Promise<CoachCallResult>;

function buildUserPrompt(input: CoachCallInput): string {
  const items =
    input.itemHints.length > 0
      ? input.itemHints.map((i) => `- ${i.id}: ${i.tl}`).join('\n')
      : '(none)';
  return [
    'سؤال المتعلم:',
    input.learnerQuestion.trim(),
    '',
    'كلمات الدرس الحالية (لو مفيدة):',
    items,
  ].join('\n');
}

/**
 * Live coach side-channel call. Short timeout → bank fallback.
 * Separate from the character turn model.
 */
export function createLiveConvoCoachCaller(
  timeoutMs: number = COACH_CALL_TIMEOUT_MS,
): ConvoCoachCaller {
  return async (input) => {
    try {
      const result = await Promise.race([
        generateText({
          model: getChatModel(),
          system: COACH_SIDE_SYSTEM,
          prompt: buildUserPrompt(input),
          temperature: 0.3,
          maxOutputTokens: 80,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('coach_timeout')), timeoutMs),
        ),
      ]);
      let eg = (result.text ?? '').trim();
      if (!eg) {
        return { eg: COACH_CALL_FALLBACK_EG, timedOut: false, error: 'empty' };
      }
      if (!eg.includes('جرّب تقولها')) {
        eg = `${eg.replace(/\s+$/, '')} — جرّب تقولها`;
      }
      return { eg, timedOut: false };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'coach_error';
      return {
        eg: COACH_CALL_FALLBACK_EG,
        timedOut: msg === 'coach_timeout',
        error: msg,
      };
    }
  };
}

/** Deterministic stub for tests. */
export function createStubConvoCoachCaller(
  opts: {
    eg?: string;
    fail?: 'timeout' | 'error';
    delayMs?: number;
  } = {},
): ConvoCoachCaller & { calls: number; lastInput: CoachCallInput | null } {
  const state = {
    calls: 0,
    lastInput: null as CoachCallInput | null,
  };
  const caller = (async (input: CoachCallInput) => {
    state.calls += 1;
    state.lastInput = input;
    if (opts.delayMs) {
      await new Promise((r) => setTimeout(r, opts.delayMs));
    }
    if (opts.fail === 'timeout') {
      return {
        eg: COACH_CALL_FALLBACK_EG,
        timedOut: true,
        error: 'coach_timeout',
      };
    }
    if (opts.fail === 'error') {
      return {
        eg: COACH_CALL_FALLBACK_EG,
        timedOut: false,
        error: 'coach_error',
      };
    }
    return {
      eg:
        opts.eg ??
        'قول مع أرز: com arroz — جرّب تقولها',
      timedOut: false,
    };
  }) as ConvoCoachCaller & {
    calls: number;
    lastInput: CoachCallInput | null;
  };
  Object.defineProperty(caller, 'calls', {
    get: () => state.calls,
  });
  Object.defineProperty(caller, 'lastInput', {
    get: () => state.lastInput,
  });
  return caller;
}
