/**
 * Time-estimate feed for §2.2 (16 §9.3).
 * User median after ≥30 of that type; else global; else STEP_SECONDS default.
 */

import {
  estimatedSecondsForType,
  STEP_SECONDS,
  type StepTimeKey,
} from './stepTimes';

export type StepTimeOverrides = {
  user?: Record<string, number> | null;
  global?: Record<string, number> | null;
};

function msToSeconds(ms: number): number {
  return Math.max(5, Math.round(ms / 1000));
}

/**
 * Resolve planned seconds for a step type, optionally using logged medians.
 */
export function resolveStepSeconds(
  type: string,
  overrides?: StepTimeOverrides | null,
): number {
  const userMs = overrides?.user?.[type];
  if (typeof userMs === 'number' && userMs > 0) {
    return msToSeconds(userMs);
  }
  const globalMs = overrides?.global?.[type];
  if (typeof globalMs === 'number' && globalMs > 0) {
    return msToSeconds(globalMs);
  }
  return estimatedSecondsForType(type);
}

/** Default seconds table (for admin / docs). */
export function defaultStepSecondsTable(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(STEP_SECONDS)) {
    out[k] = v;
  }
  return out;
}

export type { StepTimeKey };
