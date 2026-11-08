import { isV2DevAllowed } from '@/lib/v2/flags';
import {
  dayOverrideFromSearch,
  learnerCurrentDay,
} from '@/lib/v2/progress/learnerDay';

/**
 * Level = last completed / current curriculum day.
 * `?level=N` override is honored only in dev (`V2_DEV` or non-production).
 */
export function levelOverrideFromSearch(
  raw: string | null | undefined,
): number | null {
  if (!isV2DevAllowed()) return null;
  return dayOverrideFromSearch(raw);
}

export function levelOverrideFromBody(
  raw: unknown,
): number | null {
  if (!isV2DevAllowed()) return null;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 1) {
    return null;
  }
  return Math.floor(raw);
}

export async function learnerConvoLevel(
  userId: string,
  override: number | null = null,
): Promise<number> {
  if (override != null && isV2DevAllowed()) return override;
  return learnerCurrentDay(userId);
}
