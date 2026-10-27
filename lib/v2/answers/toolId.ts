import type { Item } from '@/lib/v2/content/items';

/**
 * tool_id for lesson/question answers =
 * tested item's pattern id, else lesson grammar_focus id.
 */
export function resolveToolId(opts: {
  itemId?: string | null;
  items?: Item[];
  grammarFocusId?: string | null;
  pageToolId?: string | null;
}): string | undefined {
  const itemId = opts.itemId ?? undefined;
  if (itemId) {
    const ex = itemId.match(/^(pattern\..+)\.ex\.\d+$/);
    if (ex?.[1]) return ex[1];
    if (itemId.startsWith('pattern.') && !/\.ex\.\d+$/.test(itemId)) {
      return itemId;
    }
    const bank = opts.items ?? [];
    for (const it of bank) {
      if (it.type !== 'pattern') continue;
      if (it.examples?.includes(itemId)) return it.id;
    }
  }
  if (opts.grammarFocusId) return opts.grammarFocusId;
  if (opts.pageToolId) return opts.pageToolId;
  return undefined;
}
