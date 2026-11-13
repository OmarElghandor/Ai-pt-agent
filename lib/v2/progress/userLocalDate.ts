import {
  localDateString,
  startOfLocalDay,
} from '@/lib/v2/progress/localDate';
import { DEFAULT_LEARNER_TIMEZONE } from '@/lib/v2/progress/lessonProgressTypes';

export { DEFAULT_LEARNER_TIMEZONE };

/** Resolve learner timezone; invalid → Europe/Lisbon. */
export function resolveLearnerTimezone(
  timezone: string | null | undefined,
): string {
  const tz = (timezone ?? '').trim() || DEFAULT_LEARNER_TIMEZONE;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return DEFAULT_LEARNER_TIMEZONE;
  }
}

/** Today's YYYY-MM-DD in the learner's timezone. */
export function userLocalDate(
  timezone: string | null | undefined,
  now: Date = new Date(),
): string {
  return localDateString(now, resolveLearnerTimezone(timezone));
}

/** Next local calendar date (YYYY-MM-DD) after `localDate` in the timezone. */
export function nextLocalDate(
  localDate: string,
  timezone: string | null | undefined,
): string {
  const tz = resolveLearnerTimezone(timezone);
  const [y, m, d] = localDate.split('-').map(Number);
  // Noon UTC on that calendar label avoids DST edge when converting.
  const approx = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1, 12, 0, 0));
  const start = startOfLocalDay(approx, tz, 0);
  return localDateString(new Date(start.getTime() + 36 * 60 * 60 * 1000), tz);
}

/** True when `candidate` is strictly after `today` (YYYY-MM-DD). */
export function isFutureLocalDate(candidate: string, today: string): boolean {
  return candidate > today;
}

/** Compare local dates: -1 / 0 / 1. */
export function compareLocalDates(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Days strictly between `fromExclusive` and `toExclusive` (YYYY-MM-DD),
 * walking calendar days in `timezone`.
 */
export function localDatesBetween(
  fromExclusive: string,
  toExclusive: string,
  timezone: string | null | undefined,
): string[] {
  const tz = resolveLearnerTimezone(timezone);
  const out: string[] = [];
  let cursor = nextLocalDate(fromExclusive, tz);
  while (cursor < toExclusive) {
    out.push(cursor);
    cursor = nextLocalDate(cursor, tz);
    if (out.length > 400) break;
  }
  return out;
}
