import { loadCoreItemsFile } from '@/lib/v2/generation/lesson/coreItems';

let cached: Map<string, number> | null = null;

/** item_id → first curriculum day it appears on (from core-items). */
export function itemIntroducedDayMap(): Map<string, number> {
  if (cached) return cached;
  const map = new Map<string, number>();
  const file = loadCoreItemsFile();
  for (const day of file.days) {
    for (const item of day.core_items) {
      const id = item.id?.trim();
      if (!id) continue;
      const prev = map.get(id);
      if (prev == null || day.day < prev) map.set(id, day.day);
    }
  }
  cached = map;
  return map;
}

/** Reset cache (tests). */
export function resetItemIntroducedDayMap(): void {
  cached = null;
}

/**
 * Highest introduced day among item ids.
 * Unknown ids (not in curriculum) count as day Number.POSITIVE_INFINITY
 * unless `unknownAs` is set.
 */
export function maxIntroducedDay(
  itemIds: ReadonlyArray<string>,
  opts?: { unknownAs?: number },
): number {
  if (itemIds.length === 0) return 1;
  const map = itemIntroducedDayMap();
  let max = 1;
  for (const id of itemIds) {
    const d = map.get(id);
    const day =
      d ??
      (opts?.unknownAs != null ? opts.unknownAs : Number.POSITIVE_INFINITY);
    if (day > max) max = day;
  }
  return max;
}

export function allItemsAtOrBelowLevel(
  itemIds: ReadonlyArray<string>,
  level: number,
): boolean {
  if (itemIds.length === 0) return true;
  const map = itemIntroducedDayMap();
  for (const id of itemIds) {
    const d = map.get(id);
    if (d == null) return false;
    if (d > level) return false;
  }
  return true;
}
