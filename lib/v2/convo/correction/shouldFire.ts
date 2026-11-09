/**
 * When to skip the async free-text correction call (K2).
 */

export function countContentTokens(text: string): number {
  return (text.trim().match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

export function shouldFireFreeTextCorrection(opts: {
  learnerText: string;
  /** Chip / ساعدني أرد path. */
  assisted?: boolean;
  /** Survival button path. */
  survival?: boolean;
  /** Side-channel kind if any (Arabic/English). */
  sideChannel?: boolean;
  /** Exact chip / accepted form match (short answers). */
  exactAccepted?: boolean;
}): boolean {
  const t = opts.learnerText.trim();
  if (!t) return false;
  if (opts.assisted || opts.survival || opts.sideChannel) return false;
  if (opts.exactAccepted && countContentTokens(t) < 2) return false;
  // Need some Portuguese letters.
  if (!/[A-Za-zÀ-ÿ]/.test(t)) return false;
  return true;
}

/** Chip / frame exact match (accent-insensitive). */
export function matchesAcceptedForm(
  learnerText: string,
  accepted: string[],
): boolean {
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  const n = norm(learnerText);
  if (!n) return false;
  return accepted.some((a) => norm(a) === n);
}
