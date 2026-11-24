/**
 * Build computed weight rows for every core item (17 W1).
 * Pure: same file + freq map → same rows. Persistence is separate.
 */

import type {
  CoreItem,
  CoreItemsFile,
} from '@/lib/v2/generation/lesson/coreItems';
import { computeWeight } from './compute';
import {
  inPalavrasSet,
  lookupFreqRank,
  PALAVRAS_FALLBACK_RANK,
  type FreqRankMap,
} from './freq';
import { introducedDayById, reuseCountForItem } from './reuse';

export type ItemWeightRow = {
  item_id: string;
  lang: string;
  day: number;
  tl: string;
  kind: CoreItem['kind'];
  priority: CoreItem['priority'];
  survival: boolean;
  freq_rank: number | null;
  reuse_count: number;
  weight: number;
  weight_why: string[];
  /** No corpus rank and not in curated 1000-palavras → flagged for admin. */
  needs_review: boolean;
};

export type BuildWeightRowsOpts = {
  file: CoreItemsFile;
  freqMap?: FreqRankMap;
  /** Curated 1000-palavras membership (normalized). */
  palavrasSet?: Set<string>;
  /** Default: file.lang or pt-PT. */
  lang?: string;
  /** Only include items introduced on day ≤ this (default: all). */
  throughDay?: number;
};

/**
 * One row per unique core item id (first introduction day wins for `day`).
 */
export function buildWeightRows(opts: BuildWeightRowsOpts): ItemWeightRow[] {
  const days = opts.file.days ?? [];
  const lang = opts.lang ?? opts.file.lang ?? 'pt-PT';
  const freqMap = opts.freqMap ?? new Map<string, number>();
  const palavrasSet = opts.palavrasSet ?? new Set<string>();
  const intro = introducedDayById(days);
  const through = opts.throughDay ?? Infinity;

  const firstItem = new Map<string, CoreItem>();
  for (const day of days) {
    for (const item of day.core_items ?? []) {
      if (!item?.id) continue;
      if (!firstItem.has(item.id)) firstItem.set(item.id, item);
    }
  }

  const rows: ItemWeightRow[] = [];
  for (const [id, introducedDay] of intro) {
    if (introducedDay > through) continue;
    const item = firstItem.get(id);
    if (!item) continue;

    const survival = Boolean(
      (item as CoreItem & { survival?: boolean }).survival,
    );
    let freq_rank = lookupFreqRank(item.tl, freqMap);
    const inPalavras = inPalavrasSet(item.tl, palavrasSet);
    /** Effective rank for points: corpus, else palavras → 1501–3000 band. */
    let rankForPoints = freq_rank;
    if (rankForPoints == null && inPalavras) {
      rankForPoints = PALAVRAS_FALLBACK_RANK;
    }

    const reuse_count = reuseCountForItem(id, introducedDay, days);
    const { weight, weight_why } = computeWeight({
      priority: item.priority,
      freq_rank: rankForPoints,
      reuse_count,
      survival,
      kind: item.kind,
    });
    if (freq_rank == null && inPalavras) {
      weight_why.push('in-1000-palavras');
    }

    rows.push({
      item_id: id,
      lang,
      day: introducedDay,
      tl: item.tl,
      kind: item.kind,
      priority: item.priority,
      survival,
      freq_rank,
      reuse_count,
      weight,
      weight_why,
      needs_review: freq_rank == null && !inPalavras,
    });
  }

  rows.sort(
    (a, b) =>
      b.weight - a.weight || a.day - b.day || a.item_id.localeCompare(b.item_id),
  );
  return rows;
}
