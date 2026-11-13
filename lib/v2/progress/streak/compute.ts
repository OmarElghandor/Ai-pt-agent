import type { V2UserStreak } from '@/lib/v2/auth/types';
import { emptyStreak } from '@/lib/v2/auth/types';
import {
  localDatesBetween,
  nextLocalDate,
  resolveLearnerTimezone,
} from '@/lib/v2/progress/userLocalDate';

const MAX_GRACE = 2;

/**
 * Pure streak update when `localDate` first becomes counts_for_streak.
 * Grace: up to 2 missed days in any rolling 7-day window.
 * Count = active days only (grace keeps alive but does not add).
 */
export function applyStreakActivity(
  prev: V2UserStreak | null | undefined,
  opts: {
    localDate: string;
    timezone?: string | null;
  },
): V2UserStreak {
  const tz = resolveLearnerTimezone(opts.timezone);
  const streak = prev ? { ...prev, missed_days: [...prev.missed_days] } : emptyStreak();
  const today = opts.localDate;

  if (streak.last_active_day === today) {
    return streak;
  }

  if (!streak.last_active_day) {
    return {
      current: 1,
      best: Math.max(1, streak.best),
      last_active_day: today,
      missed_days: [],
    };
  }

  const missed = localDatesBetween(streak.last_active_day, today, tz);
  // Drop missed days older than 7 days before today.
  const windowStart = (() => {
    let d = today;
    for (let i = 0; i < 6; i++) {
      // walk back 6 days → 7-day window including today
      const [y, m, day] = d.split('-').map(Number);
      const approx = new Date(Date.UTC(y!, (m ?? 1) - 1, (day ?? 1) - 1, 12));
      d = approx.toISOString().slice(0, 10);
      // Prefer timezone-aware: use nextLocalDate inverse via iterating
    }
    // Simpler: keep missed that fall within last 6 calendar days before today
    return missed;
  })();

  const recentMissed = [
    ...streak.missed_days.filter((d) => d < today && daysBetween(d, today) <= 6),
    ...missed.filter((d) => daysBetween(d, today) <= 6),
  ];
  const uniqueMissed = [...new Set(recentMissed)].sort();

  if (uniqueMissed.length > MAX_GRACE) {
    return {
      current: 1,
      best: Math.max(1, streak.best),
      last_active_day: today,
      missed_days: [],
    };
  }

  const nextCurrent = streak.current + 1;
  return {
    current: nextCurrent,
    best: Math.max(streak.best, nextCurrent),
    last_active_day: today,
    missed_days: uniqueMissed.slice(0, MAX_GRACE),
  };

  void windowStart;
  void nextLocalDate;
}

function daysBetween(a: string, b: string): number {
  const da = Date.parse(`${a}T12:00:00Z`);
  const db = Date.parse(`${b}T12:00:00Z`);
  return Math.round((db - da) / (24 * 60 * 60 * 1000));
}

export function graceDaysLeft(streak: V2UserStreak): number {
  return Math.max(0, MAX_GRACE - streak.missed_days.length);
}

export function streakGraceLine(streak: V2UserStreak): string | null {
  if (streak.missed_days.length === 0) return null;
  return 'فوّت يوم، والسلسلة لسه ماشية';
}
