const ARABIC_RE = /[\u0600-\u06FF]/
const LATIN_RE = /[A-Za-zÀ-ÿ]/

/** True when the answer has Arabic letters and no Latin (pt) letters. */
export function isArabicOnly(answer: string): boolean {
  const t = answer.trim();
  if (!t) return false;
  return ARABIC_RE.test(t) && !LATIN_RE.test(t);
}
