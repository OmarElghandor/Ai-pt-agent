import { generateText } from 'ai';
import { getCoachModel } from '@/lib/model';
import { findForbiddenScript } from '@/lib/v2/convo/output/scriptGuard';

/** Batch 9 C8 / side-channel fix S4: 6 s. */
export const COACH_CALL_TIMEOUT_MS = 6_000;

export const COACH_CALL_FALLBACK_EG =
  'جرّب تقولها بالبرتغالي — لو مش متأكد، اسأل تاني بجملة أقصر';

export const COACH_SUFFIX_EG = 'جرّب تقولها';

/** Fixed Egyptian coach system prompt (09 §6). Never sees the character prompt. */
export const COACH_SIDE_SYSTEM = [
  'أنت كوتش مصري بتساعد متعلم برتغالي أوروبي (pt-PT) في لشبونة.',
  'جاوب بالعامية المصرية في سطر أو سطرين فقط.',
  'لو سأل ازاي يقول حاجة، ادّي الصيغة البرتغالية القصيرة المناسبة لمستوى مبتدئ.',
  'لازم الرد فيه عربي مصري + جملة أو كلمة برتغالية (pt-PT) واضحة.',
  'فضّل إعادة استخدام جمل المحادثة الحالية لو مناسبة.',
  'ما تكتبش «جرّب تقولها» — الكود بيضيفها لوحده.',
  'ما تشرحش قواعد، وما تطوّلش.',
  'ممنوع صيني أو سيريلي أو أي سكريبت غير عربي/لاتيني.',
  '',
  'أمثلة:',
  'سؤال: ازاي أقول مع رز؟',
  'جواب: قول «com arroz».',
  '',
  'سؤال: يعني إيه esquina؟',
  'جواب: esquina يعني ركن الشارع.',
  '',
  'سؤال: ساكن في أمادورا',
  'جواب: حلو — بالبرتغالي: «Moro em Amadora».',
].join('\n');

export type CoachContextLine = {
  tl: string;
  ar?: string;
};

export type CoachCallInput = {
  learnerQuestion: string;
  /** Current pack item ids with tl surfaces (context only). */
  itemHints: Array<{ id: string; tl: string }>;
  /** S4: conversation lines (share/ask/chips) for the model to reuse. */
  contextLines?: CoachContextLine[];
};

export type CoachCallResult = {
  eg: string;
  timedOut: boolean;
  error?: string;
};

export type ConvoCoachCaller = (
  input: CoachCallInput,
) => Promise<CoachCallResult>;

const LATIN_SPAN_RE =
  /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]*(?:\s+[A-Za-zÀ-ÿ'’-]+)*/g;

/** Strip any model-supplied suffix; code always re-appends it. */
export function stripCoachSuffix(eg: string): string {
  return eg
    .replace(/\s*[—\-–]?\s*جرّب تقولها\s*$/u, '')
    .replace(/\s+$/u, '')
    .trim();
}

export function finalizeCoachReply(eg: string): string {
  const body = stripCoachSuffix(eg);
  if (!body) return COACH_CALL_FALLBACK_EG;
  return `${body} — ${COACH_SUFFIX_EG}`;
}

export type CoachValidation = { ok: true } | { ok: false; reason: string };

/**
 * Coach reply must include Arabic script and a Portuguese segment that
 * is not just echoing the learner's own Latin text (E2), and no forbidden
 * scripts (learn-fix-2 M2).
 */
export function validateCoachReply(
  eg: string,
  learnerQuestion: string,
): CoachValidation {
  const body = stripCoachSuffix(eg);
  if (!body) return { ok: false, reason: 'empty' };
  const forbidden = findForbiddenScript(body);
  if (forbidden) {
    return { ok: false, reason: `forbidden_script:${forbidden}` };
  }
  if (!/[\u0600-\u06FF]/.test(body)) {
    return { ok: false, reason: 'missing_arabic' };
  }
  const spans = [...body.matchAll(LATIN_SPAN_RE)].map((m) => m[0]!.trim());
  if (spans.length === 0) {
    return { ok: false, reason: 'missing_portuguese' };
  }
  const learnerLower = learnerQuestion.toLowerCase();
  const hasDistinctPt = spans.some(
    (s) => s.length >= 2 && !learnerLower.includes(s.toLowerCase()),
  );
  if (hasDistinctPt) return { ok: true };
  // Learner already asked about a PT word (يعني إيه esquina) — repeating it is OK.
  if (/[A-Za-zÀ-ÿ]/.test(learnerQuestion)) return { ok: true };
  return { ok: false, reason: 'portuguese_same_as_learner' };
}

function buildUserPrompt(input: CoachCallInput, retryReason?: string): string {
  const items =
    input.itemHints.length > 0
      ? input.itemHints.map((i) => `- ${i.id}: ${i.tl}`).join('\n')
      : '(none)';
  const parts = [
    'سؤال المتعلم:',
    input.learnerQuestion.trim(),
    '',
    'كلمات الدرس الحالية (لو مفيدة):',
    items,
  ];
  if (input.contextLines && input.contextLines.length > 0) {
    parts.push(
      '',
      'جمل المحادثة الحالية (فضّل إعادة استخدامها لو مناسبة):',
      ...input.contextLines.map((l) =>
        l.ar ? `- PT: ${l.tl} | AR: ${l.ar}` : `- PT: ${l.tl}`,
      ),
    );
  }
  if (retryReason) {
    parts.push(
      '',
      `الرد السابق كان غلط (${retryReason}). جاوب بالعامية المصرية ومعاها جملة/كلمة برتغالية pt-PT واضحة. بدون سكريبتات تانية.`,
    );
  }
  return parts.join('\n');
}

async function generateCoachText(
  input: CoachCallInput,
  timeoutMs: number,
  retryReason?: string,
): Promise<string> {
  const result = await Promise.race([
    generateText({
      model: getCoachModel(),
      system: COACH_SIDE_SYSTEM,
      prompt: buildUserPrompt(input, retryReason),
      temperature: 0.3,
      maxOutputTokens: 80,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('coach_timeout')), timeoutMs),
    ),
  ]);
  return (result.text ?? '').trim();
}

/**
 * Live coach side-channel call. Validates Arabic+PT, one retry, then bank fallback.
 * Separate from the character turn model.
 */
export function createLiveConvoCoachCaller(
  timeoutMs: number = COACH_CALL_TIMEOUT_MS,
): ConvoCoachCaller {
  return async (input) => {
    try {
      let raw = await generateCoachText(input, timeoutMs);
      let check = validateCoachReply(raw, input.learnerQuestion);
      if (!check.ok) {
        raw = await generateCoachText(input, timeoutMs, check.reason);
        check = validateCoachReply(raw, input.learnerQuestion);
      }
      if (!check.ok) {
        return {
          eg: COACH_CALL_FALLBACK_EG,
          timedOut: false,
          error: check.reason,
        };
      }
      return { eg: finalizeCoachReply(raw), timedOut: false };
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
    const raw =
      opts.eg ?? 'قول مع أرز: com arroz — جرّب تقولها';
    const check = validateCoachReply(raw, input.learnerQuestion);
    if (!check.ok) {
      return {
        eg: COACH_CALL_FALLBACK_EG,
        timedOut: false,
        error: check.reason,
      };
    }
    return {
      eg: finalizeCoachReply(raw),
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
