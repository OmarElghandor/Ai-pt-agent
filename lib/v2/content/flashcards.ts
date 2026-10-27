import type { Item } from './items';

/**
 * Legacy fallback when `has_card` is omitted.
 * Tight set: articles, contractions, prepositions, conjunctions, clitics/subject pronouns.
 * Not the generation FUNCTION_WORDS list (that includes obrigado, hoje).
 */
export const NO_CARD_LEMMAS = new Set(
  [
    'a',
    'o',
    'as',
    'os',
    'um',
    'uma',
    'uns',
    'umas',
    'de',
    'do',
    'da',
    'dos',
    'das',
    'em',
    'no',
    'na',
    'nos',
    'nas',
    'ao',
    'à',
    'aos',
    'às',
    'por',
    'para',
    'com',
    'sem',
    'e',
    'ou',
    'mas',
    'que',
    'se',
    'não',
    'sim',
    'eu',
    'tu',
    'ele',
    'ela',
    'você',
    'nós',
    'eles',
    'elas',
    'me',
    'te',
  ].map((s) => s.normalize('NFC').toLowerCase()),
);

function lemmaKey(item: Item): string {
  const lemma =
    'lemma' in item && typeof item.lemma === 'string' ? item.lemma : '';
  const tl = 'tl' in item && typeof item.tl === 'string' ? item.tl : '';
  const raw = lemma || tl;
  return raw
    .normalize('NFC')
    .toLowerCase()
    .replace(/^(o|a|os|as|um|uma)\s+/i, '')
    .trim();
}

/**
 * Items that enter the flashcard / SRS deck.
 * Prefer explicit `has_card`. No card for pattern, derived, recycle copies, or set items.
 */
export function isFlashcardItem(item: Item): boolean {
  const flagged = item as { has_card?: boolean; derived?: boolean };
  if (flagged.has_card === false) return false;
  if (flagged.derived) return false;
  if (item.type === 'form' || item.type === 'pattern') return false;
  if (item.type === 'sentence') return false;

  if (flagged.has_card === true) {
    return item.type === 'word' || item.type === 'phrase';
  }

  // Flag omitted — infer, with lemma fallback for legacy packs.
  if (item.type === 'word' || item.type === 'phrase') {
    if (NO_CARD_LEMMAS.has(lemmaKey(item))) return false;
    return true;
  }
  return false;
}

export function flashcardItems(bank: Item[]): Item[] {
  return bank.filter(isFlashcardItem);
}

/** Multi-word set ids that must never become cards (items job also sets has_card:false). */
export const SET_ITEM_IDS = new Set([
  'word.numbers_0_10',
  'word.numbers_11_20',
  'word.numbers_tens',
  'word.numbers_100_plus',
]);

export function shouldForceNoCard(
  item: Item,
  opts?: { recycleIds?: Set<string> },
): boolean {
  if (item.type === 'pattern' || item.type === 'form' || item.type === 'sentence') {
    return true;
  }
  if ((item as { derived?: boolean }).derived) return true;
  if (opts?.recycleIds?.has(item.id)) return true;
  if (SET_ITEM_IDS.has(item.id)) return true;
  if (item.id.startsWith('word.numbers_')) return true;
  return false;
}
