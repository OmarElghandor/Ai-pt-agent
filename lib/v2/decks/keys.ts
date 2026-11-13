/** Custom-deck item key helpers (12 §2.1 / C1). */

export type CustomItemPos = 'noun' | 'verb' | 'adjective' | 'phrase';

const ARTICLE_RE = /^(o|a|os|as|um|uma)\s+/i;

/**
 * Normalise a TL string for the custom-item key:
 * NFC, lowercase, strip leading article; accents kept.
 */
export function normaliseLemma(tl: string): string {
  return tl
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(ARTICLE_RE, '')
    .trim();
}

/** Stable custom item id: `ugc.{lang}.{lemma}.{pos}` */
export function customItemId(
  lang: string,
  lemmaOrTl: string,
  pos: CustomItemPos,
): string {
  const lemma = normaliseLemma(lemmaOrTl);
  return `ugc.${lang}.${lemma}.${pos}`;
}

export function isCustomItemId(itemId: string): boolean {
  return itemId.startsWith('ugc.');
}

/** Strip article for display/matching but keep the original for storage. */
export function stripArticle(tl: string): string {
  return tl.replace(ARTICLE_RE, '').trim();
}

export function leadingArticle(
  tl: string,
): 'o' | 'a' | 'os' | 'as' | 'um' | 'uma' | null {
  const m = tl.trim().match(ARTICLE_RE);
  if (!m) return null;
  return m[1]!.toLowerCase() as 'o' | 'a' | 'os' | 'as' | 'um' | 'uma';
}
