/** Fixed micro list order (19 §3.5): level first, then outline order. Never progress/recency. */

export const LEVEL_LABELS = [
  '',
  'سهل جداً',
  'سهل',
  'متوسط',
  'أصعب شوية',
  'صعب',
] as const;

export type SeriesOrderKey = {
  /** Lowest clip level in the series (1–5). Missing → 99 so it sorts last. */
  min_level: number;
  order: number;
};

export type ClipOrderKey = {
  level: number;
  series_order: number;
  order: number;
};

export function minLevel(levels: number[]): number {
  if (!levels.length) return 99;
  return Math.min(...levels);
}

export function compareSeriesByLevelThenOrder(
  a: SeriesOrderKey,
  b: SeriesOrderKey,
): number {
  if (a.min_level !== b.min_level) return a.min_level - b.min_level;
  return a.order - b.order;
}

export function compareClipsByLevelThenOrder(
  a: ClipOrderKey,
  b: ClipOrderKey,
): number {
  if (a.level !== b.level) return a.level - b.level;
  if (a.series_order !== b.series_order) return a.series_order - b.series_order;
  return a.order - b.order;
}

export function groupByLevel<T extends { level: number }>(
  items: T[],
): Array<{ level: number; label: string; items: T[] }> {
  const byLevel = new Map<number, T[]>();
  for (const item of items) {
    const list = byLevel.get(item.level) ?? [];
    list.push(item);
    byLevel.set(item.level, list);
  }
  return [...byLevel.entries()]
    .sort(([a], [b]) => a - b)
    .map(([level, group]) => ({
      level,
      label: LEVEL_LABELS[level] ?? `L${level}`,
      items: group,
    }));
}
