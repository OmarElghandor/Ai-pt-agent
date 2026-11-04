import { isArabicOnly } from '@/lib/v2/answers/arabicOnly';

const ARABIC_RE = /[\u0600-\u06FF]/
const LATIN_RE = /[A-Za-zÀ-ÿ]/

/** True when the text contains at least one Arabic letter. */
export function hasArabicScript(text: string): boolean {
  return ARABIC_RE.test(text.trim());
}

/** True when the text has both Arabic and Latin letters. */
export function isMixedScript(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return ARABIC_RE.test(t) && LATIN_RE.test(t);
}

/**
 * Side-channel gate (09 §6): Arabic-only or mixed script.
 * Pure Latin (pt answers, off-topic English) stays on the character path.
 */
export function needsSideChannel(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return isArabicOnly(t) || isMixedScript(t) || hasArabicScript(t);
}

export { isArabicOnly };
