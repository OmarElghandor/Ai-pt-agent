import { normalizeAnswer, normalizeForCompare } from './normalize';

export type MatchResult =
  | { kind: 'exact' }
  | { kind: 'accent' }
  | { kind: 'spelling' }
  | { kind: 'miss' };

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
 * Exact / accepted alternatives / accent-only / close spelling (M5).
 * Accent-only = correct for SRS (caller treats as correct) + accent error row.
 * Spelling = near_miss (counts correct for rung).
 */
export function matchAnswer(
  answer: string,
  accepted: string[],
): MatchResult {
  const norm = normalizeAnswer(answer);
  const stripped = normalizeForCompare(answer);

  for (const a of accepted) {
    if (normalizeAnswer(a) === norm) return { kind: 'exact' };
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
