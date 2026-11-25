import {
  normalizeAnswer,
  normalizeForCompare,
  stripAccents,
} from './normalize';

export type MatchResult =
  | { kind: 'exact' }
  | { kind: 'accent' }
  | { kind: 'spelling' }
  | { kind: 'miss' };

export type GradeAcceptedOpen = {
  correct: boolean;
  accent_only: boolean;
  canonical: string;
};

/** Classic Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = b.length + 1;
  const cols = a.length + 1;
  const prev = new Array<number>(cols);
  const cur = new Array<number>(cols);
  for (let j = 0; j < cols; j++) prev[j] = j;
  for (let i = 1; i < rows; i++) {
    cur[0] = i;
    for (let j = 1; j < cols; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + cost,
      );
    }
    for (let j = 0; j < cols; j++) prev[j] = cur[j]!;
  }
  return prev[a.length]!;
}

/** Max allowed edits: 1, or 2 when the expected form is ≥8 letters. */
export function spellingTolerance(expectedLen: number): number {
  return expectedLen >= 8 ? 2 : 1;
}

/**
 * Content word for spelling compare: drop leading articles (accents kept).
 */
export function contentWord(tl: string): string {
  return normalizeAnswer(tl).replace(
    /^(o|a|os|as|à|ao|um|uma|uns|umas|na|no)\s+/i,
    '',
  );
}

/** Accent-stripped content word for Levenshtein. */
export function contentWordForCompare(tl: string): string {
  return normalizeForCompare(contentWord(tl));
}

/**
 * Prefer the first accepted form that still carries accents; else the first entry.
 * Used so accent-stripped variants in `accepted[]` do not hide accent-only misses.
 */
export function pickCanonical(accepted: string[]): string {
  for (const a of accepted) {
    if (!a) continue;
    if (stripAccents(a) !== a) return a;
  }
  return accepted[0] ?? '';
}

/**
 * Exact / accepted alternatives / accent-only / close spelling (M5).
 * Accent-only = correct for SRS (caller treats as correct) + accent error row.
 * Spelling = near_miss (counts correct for rung).
 *
 * When `accepted` includes both accented and stripped forms (e.g. `Até já` +
 * `ate ja`), a learner answer that only matches the stripped form is still
 * `accent` if it differs from the canonical accented form.
 */
export function matchAnswer(
  answer: string,
  accepted: string[],
): MatchResult {
  if (!accepted.length) return { kind: 'miss' };

  const norm = normalizeAnswer(answer);
  const stripped = normalizeForCompare(answer);
  const canonical = pickCanonical(accepted);
  const canonNorm = normalizeAnswer(canonical);
  const canonStripped = normalizeForCompare(canonical);

  let matchedAccepted = false;
  for (const a of accepted) {
    if (normalizeAnswer(a) === norm) {
      matchedAccepted = true;
      break;
    }
  }

  if (matchedAccepted) {
    if (
      canonical &&
      canonStripped === stripped &&
      canonNorm !== norm
    ) {
      return { kind: 'accent' };
    }
    return { kind: 'exact' };
  }

  for (const a of accepted) {
    if (normalizeForCompare(a) === stripped) return { kind: 'accent' };
  }

  const answerWord = contentWordForCompare(answer);
  if (answerWord.length >= 2) {
    for (const a of accepted) {
      const expectedWord = contentWordForCompare(a);
      if (expectedWord.length < 2) continue;
      const dist = levenshtein(answerWord, expectedWord);
      if (dist > 0 && dist <= spellingTolerance(expectedWord.length)) {
        return { kind: 'spelling' };
      }
    }
  }

  return { kind: 'miss' };
}

/**
 * Client/server helper for open writing: correct for progress when exact or
 * accent-only; `accent_only` when the learner missed diacritics vs canonical.
 */
export function gradeAcceptedOpen(
  text: string,
  accepted: string[],
): GradeAcceptedOpen {
  const canonical = pickCanonical(accepted);
  if (!accepted.length) {
    return { correct: false, accent_only: false, canonical: '' };
  }
  const m = matchAnswer(text, accepted);
  if (m.kind === 'exact') {
    return { correct: true, accent_only: false, canonical };
  }
  if (m.kind === 'accent') {
    return { correct: true, accent_only: true, canonical };
  }
  return { correct: false, accent_only: false, canonical };
}
