/**
 * Pure item-weight formula (17 §4). Never called from the answer path.
 * Code only — no model writes weight / freq_rank / reuse_count.
 */

import type { CoreItemKind, CoreItemPriority } from '@/lib/v2/generation/lesson/coreItems';

export type ComputeWeightInput = {
  priority: CoreItemPriority;
  /** null / undefined = not in list → 0 frequency points. */
  freq_rank?: number | null;
  reuse_count: number;
  survival?: boolean;
  kind: CoreItemKind;
};

export type ComputeWeightResult = {
  weight: number;
  weight_why: string[];
};

const PRIORITY_POINTS: Record<CoreItemPriority, number> = {
  essential: 60,
  useful: 35,
  situational: 15,
};

/** Frequency band points from a 1-based rank. Empty / beyond 3000 → 0. */
export function freqPoints(freqRank: number | null | undefined): {
  points: number;
  label: string | null;
} {
  if (freqRank == null || !Number.isFinite(freqRank) || freqRank < 1) {
    return { points: 0, label: null };
  }
  if (freqRank <= 500) return { points: 20, label: 'top-500' };
  if (freqRank <= 1500) return { points: 12, label: 'top-1500' };
  if (freqRank <= 3000) return { points: 6, label: 'top-3000' };
  return { points: 0, label: null };
}

/** Reuse points: +2 per later lesson, capped at +10. */
export function reusePoints(reuseCount: number): number {
  const n = Math.max(0, Math.floor(reuseCount));
  return Math.min(10, n * 2);
}

/**
 * Sum parts and cap at 100. Same input always yields the same result.
 */
export function computeWeight(input: ComputeWeightInput): ComputeWeightResult {
  const why: string[] = [];
  let points = PRIORITY_POINTS[input.priority] ?? PRIORITY_POINTS.situational;
  why.push(input.priority);

  const freq = freqPoints(input.freq_rank);
  if (freq.points > 0 && freq.label) {
    points += freq.points;
    why.push(freq.label);
  }

  const reusePts = reusePoints(input.reuse_count);
  if (reusePts > 0) {
    points += reusePts;
    why.push(`used in ${Math.max(0, Math.floor(input.reuse_count))} lessons`);
  }

  if (input.survival) {
    points += 10;
    why.push('survival');
  }

  if (input.kind === 'phrase') {
    points += 5;
    why.push('phrase');
  }

  return {
    weight: Math.min(100, points),
    weight_why: why,
  };
}
