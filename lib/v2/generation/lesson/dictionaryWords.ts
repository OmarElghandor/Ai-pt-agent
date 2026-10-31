import type { Page } from '@/lib/v2/content/page';
import type { CoreItem } from './coreItems';

/** Stable list of today's core word ids (plan order). */
export function coreWordIds(coreItems: CoreItem[]): string[] {
  return coreItems.filter((c) => c.kind === 'word').map((c) => c.id);
}

/**
 * Dictionary cards must list every day word — never a trimmed subset.
 * Ensures a cards block exists and replaces its items with wordIds.
 */
export function forceDictionaryWordCards(
  page: Page,
  wordIds: string[],
): Page {
  if (page.preset !== 'dictionary' || !wordIds.length) return page;
  const unique = [...new Set(wordIds)];
  let found = false;
  const blocks = page.blocks.map((b) => {
    if (b.type !== 'cards') return b;
    if (found) return b;
    found = true;
    return { ...b, items: unique };
  });
  if (!found) {
    blocks.push({
      id: `b${blocks.length + 1}`,
      type: 'cards',
      items: unique,
    });
  }
  return { ...page, blocks };
}
