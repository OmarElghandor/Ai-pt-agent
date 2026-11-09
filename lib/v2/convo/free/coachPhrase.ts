/** Coach phrase practise tracking (G6). */

const LATIN_SPAN_RE =
  /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]*(?:\s+[A-Za-zÀ-ÿ'’-]+)*/g;

const GUILLEMET_RE = /[«"]([^»"]+)[»"]/g;

/** Accent-/case-insensitive fold for whole-phrase equality. */
export function normalizeCoachPhrase(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function coachPhrasesEqual(a: string, b: string): boolean {
  const na = normalizeCoachPhrase(a);
  const nb = normalizeCoachPhrase(b);
  return Boolean(na) && na === nb;
}

/**
 * Pull the Portuguese practise phrase from a coach EG line.
 * Prefers guillemets «…»; else the longest Latin span (≥2 chars).
 */
export function extractCoachPhrase(eg: string): string | null {
  const fromMarks: string[] = [];
  for (const m of eg.matchAll(GUILLEMET_RE)) {
    const inner = m[1]?.trim();
    if (inner && /[A-Za-zÀ-ÿ]/.test(inner)) fromMarks.push(inner);
  }
  if (fromMarks.length > 0) {
    return fromMarks.sort((a, b) => b.length - a.length)[0] ?? null;
  }
  const spans = [...eg.matchAll(LATIN_SPAN_RE)]
    .map((m) => m[0]!.trim())
    .filter((s) => s.length >= 2);
  if (spans.length === 0) return null;
  return spans.sort((a, b) => b.length - a.length)[0] ?? null;
}

export type CoachPhraseState = {
  phrase: string;
  /** Learner PT turns remaining before the phrase expires. */
  turns_left: number;
};

/** Store a fresh coach phrase with a 2-turn TTL. */
export function setCoachPhrase(
  phrase: string | null | undefined,
): CoachPhraseState | null {
  const trimmed = phrase?.trim();
  if (!trimmed) return null;
  return { phrase: trimmed, turns_left: 2 };
}

/**
 * On a Portuguese learner turn: match → EVENT string + clear;
 * else decrement; clear at 0. Returns EVENT override or null.
 */
export function consumeCoachPhraseOnLearnerTurn(
  state: CoachPhraseState | null | undefined,
  learnerText: string,
): { next: CoachPhraseState | null; eventLine: string | null } {
  if (!state?.phrase) {
    return { next: null, eventLine: null };
  }
  if (coachPhrasesEqual(learnerText, state.phrase)) {
    return {
      next: null,
      eventLine: `learner practised the coach's phrase: ${state.phrase}`,
    };
  }
  const left = state.turns_left - 1;
  if (left <= 0) {
    return { next: null, eventLine: null };
  }
  return {
    next: { phrase: state.phrase, turns_left: left },
    eventLine: null,
  };
}
