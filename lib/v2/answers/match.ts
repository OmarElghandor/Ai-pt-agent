import { normalizeAnswer, normalizeForCompare } from './normalize';

export type MatchResult =
  | { kind: 'exact' }
  | { kind: 'accent' }
  | { kind: 'miss' };

/**
 * Exact / accepted alternatives / accent-only.
 * Accent-only = correct for SRS (caller treats as correct) + accent error row.
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
  return { kind: 'miss' };
}
