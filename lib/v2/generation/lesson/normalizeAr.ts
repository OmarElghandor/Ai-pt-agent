/**
 * MSA noun meanings: definite article ال, no tashkeel except shadda (U+0651).
 */

/** Arabic diacritics except shadda. */
const TASHKEEL_EXCEPT_SHADDA =
  /[\u064B-\u0650\u0652-\u065F\u0670]/g;

/** Strip tashkeel but keep shadda (ّ). */
export function stripTashkeelKeepShadda(ar: string): string {
  return ar.replace(TASHKEEL_EXCEPT_SHADDA, '');
}

/**
 * Normalize a word's MSA meaning: strip tashkeel (keep shadda), ensure leading ال.
 * Skips empty strings. Does not force ال onto already-prefixed forms.
 */
export function normalizeNounAr(ar: string): string {
  let s = stripTashkeelKeepShadda(ar.trim());
  if (!s) return s;
  // Already definite
  if (s.startsWith('ال')) return s;
  // Hamza-alif variants of ال
  if (s.startsWith('ٱل')) return `ال${s.slice(2)}`;
  return `ال${s}`;
}

/** Apply normalizeNounAr to every word item in the bank. */
export function normalizeWordMeanings(items: Array<{ type: string; ar?: string; ar_f?: string }>): void {
  for (const it of items) {
    if (it.type !== 'word') continue;
    if (typeof it.ar === 'string' && it.ar.trim()) {
      it.ar = normalizeNounAr(it.ar);
    }
    if (typeof it.ar_f === 'string' && it.ar_f.trim()) {
      it.ar_f = normalizeNounAr(it.ar_f);
    }
  }
}
