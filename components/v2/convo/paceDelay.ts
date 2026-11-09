/**
 * Client-side bubble pacing delays (server still sends everything at once).
 * delay ≈ 600ms + 25ms/char, capped at 2.2s.
 * prefers-reduced-motion → 150ms.
 * Tests / harness: pass scale 0 for zero delays.
 */

export const PACE_BASE_MS = 600;
export const PACE_PER_CHAR_MS = 25;
export const PACE_CAP_MS = 2_200;
export const PACE_REDUCED_MS = 150;
export const PACE_COACH_STRIP_MS = 400;

export type PaceDelayOpts = {
  charCount: number;
  /** Multiplying factor; 0 → no delay (tests/harness). Default 1. */
  scale?: number;
  reducedMotion?: boolean;
};

export function paceDelayMs(opts: PaceDelayOpts): number {
  const scale = opts.scale ?? 1;
  if (scale <= 0) return 0;
  if (opts.reducedMotion) return Math.round(PACE_REDUCED_MS * scale);
  const raw = PACE_BASE_MS + PACE_PER_CHAR_MS * Math.max(0, opts.charCount);
  return Math.round(Math.min(PACE_CAP_MS, raw) * scale);
}

export function coachStripDelayMs(opts?: {
  scale?: number;
  reducedMotion?: boolean;
}): number {
  const scale = opts?.scale ?? 1;
  if (scale <= 0) return 0;
  if (opts?.reducedMotion) return Math.round(PACE_REDUCED_MS * scale);
  return Math.round(PACE_COACH_STRIP_MS * scale);
}

/** Detect prefers-reduced-motion in the browser. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
