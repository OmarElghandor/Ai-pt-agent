import {
  defaultDailyMinutesFromEnv,
  type PracticeSplit,
} from './budget';

export type UserPracticeConfig = {
  daily_minutes: number;
  split?: Partial<PracticeSplit> | null;
};

export function normalizeUserPractice(raw: unknown): UserPracticeConfig {
  const defaults: UserPracticeConfig = {
    daily_minutes: defaultDailyMinutesFromEnv(),
    split: null,
  };
  if (!raw || typeof raw !== 'object') return defaults;
  const v = raw as Record<string, unknown>;
  const daily =
    typeof v.daily_minutes === 'number' && Number.isFinite(v.daily_minutes)
      ? Math.round(v.daily_minutes)
      : defaults.daily_minutes;
  let split: Partial<PracticeSplit> | null = null;
  if (v.split && typeof v.split === 'object') {
    const s = v.split as Record<string, unknown>;
    split = {};
    if (typeof s.lesson_minutes === 'number') {
      split.lesson_minutes = s.lesson_minutes;
    }
    if (typeof s.review_minutes === 'number') {
      split.review_minutes = s.review_minutes;
    }
    if (typeof s.cards_minutes === 'number') {
      split.cards_minutes = s.cards_minutes;
    }
  }
  return { daily_minutes: daily, split };
}
