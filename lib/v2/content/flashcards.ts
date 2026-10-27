import type { Item } from './items';

/**
 * Items that enter the flashcard / SRS deck.
 * Derived pattern examples are question/formula-only.
 * Function words are never cards (00-decisions §5).
 */
export function isFlashcardItem(item: Item): boolean {
  if ((item as { derived?: boolean }).derived) return false;
  if (item.type === 'form' || item.type === 'pattern') return false;
  if (item.type === 'word' || item.type === 'phrase') return true;
  // verb lemma cards: word-or-verb id without tense:person
  if (
    item.type === 'sentence' ||
    (typeof item.id === 'string' && /^verb\.[a-z_]+$/i.test(item.id))
  ) {
    return item.type !== 'sentence';
  }
  return false;
}

export function flashcardItems(bank: Item[]): Item[] {
  return bank.filter(isFlashcardItem);
}
