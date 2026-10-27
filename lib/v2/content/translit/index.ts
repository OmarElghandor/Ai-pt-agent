import { transliteratePtToSay } from './ptPt';

export { transliteratePtToSay } from './ptPt';

/** Fill `say` on items that have `tl` (word/phrase/sentence/form). Model never writes say. */
export function applySayToItems<
  T extends { type: string; tl?: string; say?: string },
>(items: T[]): T[] {
  return items.map((item) => {
    if (typeof item.tl !== 'string' || !item.tl.trim()) return item;
    if (item.type === 'pattern') return item;
    return { ...item, say: transliteratePtToSay(item.tl) };
  });
}
