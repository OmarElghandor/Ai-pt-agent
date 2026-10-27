import type { Item } from '@/lib/v2/content/items';
import { transliteratePtToSay } from '@/lib/v2/content/translit';

const LATIN_TOKEN = /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]*/g;

/**
 * Replace Latin (Portuguese) tokens inside Egyptian strings with code `say`.
 * Prefers item.say when the token matches an item tl token; else transliterate.
 */
export function replaceLatinWithSay(
  eg: string,
  bank: Item[],
): string {
  if (!eg || !/[A-Za-zÀ-ÿ]/.test(eg)) return eg;
  const sayByTl = new Map<string, string>();
  for (const item of bank) {
    if (!('tl' in item) || typeof item.tl !== 'string') continue;
    const say =
      'say' in item && typeof item.say === 'string' && item.say
        ? item.say
        : transliteratePtToSay(item.tl);
    for (const tok of item.tl.split(/\s+/)) {
      const clean = tok.replace(/^[,.;:!?]+|[,.;:!?]+$/g, '');
      if (clean) sayByTl.set(clean.toLowerCase(), say);
    }
    sayByTl.set(item.tl.toLowerCase(), say);
  }
  return eg.replace(LATIN_TOKEN, (tok) => {
    const hit = sayByTl.get(tok.toLowerCase());
    if (hit) return hit;
    return transliteratePtToSay(tok);
  });
}

export function applyEgSayToItems(items: Item[]): Item[] {
  return items.map((item) => {
    if (item.type !== 'phrase') return item;
    const p = item as { context_eg?: string };
    if (!p.context_eg) return item;
    return {
      ...item,
      context_eg: replaceLatinWithSay(p.context_eg, items),
    } as Item;
  });
}
