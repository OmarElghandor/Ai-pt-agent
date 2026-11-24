/**
 * How many later lessons reuse a core item (17 §3 / W1).
 * Sources for W1: later recycle_ids, later core_items, later uses[].
 */

import type { CoreItemsDay, CoreItemsFile } from '@/lib/v2/generation/lesson/coreItems';

/** First day an item appears in core_items (introduction day). */
export function introducedDayById(days: CoreItemsDay[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const day of days) {
    for (const item of day.core_items ?? []) {
      if (!item?.id) continue;
      const prev = map.get(item.id);
      if (prev == null || day.day < prev) map.set(item.id, day.day);
    }
  }
  return map;
}

/**
 * Count distinct later days where `itemId` appears in recycle_ids,
 * core_items, or any item's uses[].
 */
export function reuseCountForItem(
  itemId: string,
  introducedDay: number,
  days: CoreItemsDay[],
): number {
  let count = 0;
  for (const day of days) {
    if (day.day <= introducedDay) continue;
    const inRecycle = (day.recycle_ids ?? []).includes(itemId);
    const inCore = (day.core_items ?? []).some((i) => i.id === itemId);
    const inUses = (day.core_items ?? []).some((i) =>
      (i.uses ?? []).includes(itemId),
    );
    if (inRecycle || inCore || inUses) count += 1;
  }
  return count;
}

/** Build reuse_count for every core item in the file. */
export function reuseCountsForFile(file: CoreItemsFile): Map<string, number> {
  const days = file.days ?? [];
  const intro = introducedDayById(days);
  const out = new Map<string, number>();
  for (const [id, day] of intro) {
    out.set(id, reuseCountForItem(id, day, days));
  }
  return out;
}
