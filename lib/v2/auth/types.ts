import type { ProfileLangCode } from './languages';
import { normalizeNativeLang, normalizeTargetLang } from './languages';
import type {
  CoachDialect,
  MotivationId,
  ProficiencyLevel,
} from './onboardingProfile';
import {
  normalizeCoachDialect,
  normalizeMotivations,
  normalizeProficiency,
} from './onboardingProfile';

export type V2UserRole = 'learner' | 'admin';
export type V2UserGender = 'm' | 'f';
export type { ProfileLangCode };
export type {
  CoachDialect,
  MotivationId,
  ProficiencyLevel,
} from './onboardingProfile';

export type V2UserStreak = {
  current: number;
  best: number;
  last_active_day: string | null;
  missed_days: string[];
};

export type V2UserReminders = {
  daily_enabled: boolean;
};

export type V2User = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: V2UserRole;
  gender: V2UserGender | null;
  username: string | null;
  native_lang: ProfileLangCode;
  target_lang: ProfileLangCode;
  coach_dialect: CoachDialect | null;
  motivations: MotivationId[];
  proficiency: ProficiencyLevel | null;
  reminders: V2UserReminders;
  onboarded_at: Date | string | null;
  langify_user_id: string | null;
  timezone: string | null;
  streak: V2UserStreak | null;
  /** Practice engine budget (16 §2.2 / §7). */
  practice?: {
    daily_minutes: number;
    split?: {
      lesson_minutes?: number;
      review_minutes?: number;
      cards_minutes?: number;
    } | null;
  } | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export function emptyStreak(): V2UserStreak {
  return {
    current: 0,
    best: 0,
    last_active_day: null,
    missed_days: [],
  };
}

export function normalizeStreak(value: unknown): V2UserStreak {
  if (!value || typeof value !== 'object') return emptyStreak();
  const v = value as Record<string, unknown>;
  const missed = Array.isArray(v.missed_days)
    ? v.missed_days.filter((d): d is string => typeof d === 'string').slice(0, 2)
    : [];
  return {
    current: typeof v.current === 'number' ? v.current : 0,
    best: typeof v.best === 'number' ? v.best : 0,
    last_active_day:
      typeof v.last_active_day === 'string' ? v.last_active_day : null,
    missed_days: missed,
  };
}

export function normalizeGender(value: unknown): V2UserGender | null {
  if (value === 'm' || value === 'f') return value;
  return null;
}

export function normalizeRole(value: unknown): V2UserRole {
  return value === 'admin' ? 'admin' : 'learner';
}

export function normalizeReminders(value: unknown): V2UserReminders {
  if (!value || typeof value !== 'object') {
    return { daily_enabled: false };
  }
  const v = value as Record<string, unknown>;
  return { daily_enabled: Boolean(v.daily_enabled) };
}

export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 30) : null;
}

export function normalizePractice(
  value: unknown,
): V2User['practice'] | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const daily =
    typeof v.daily_minutes === 'number' && Number.isFinite(v.daily_minutes)
      ? Math.round(v.daily_minutes)
      : null;
  if (daily == null || daily < 5) return null;
  const splitRaw =
    v.split && typeof v.split === 'object'
      ? (v.split as Record<string, unknown>)
      : null;
  return {
    daily_minutes: daily,
    split: splitRaw
      ? {
          lesson_minutes:
            typeof splitRaw.lesson_minutes === 'number'
              ? splitRaw.lesson_minutes
              : undefined,
          review_minutes:
            typeof splitRaw.review_minutes === 'number'
              ? splitRaw.review_minutes
              : undefined,
          cards_minutes:
            typeof splitRaw.cards_minutes === 'number'
              ? splitRaw.cards_minutes
              : undefined,
        }
      : null,
  };
}

export {
  normalizeCoachDialect,
  normalizeMotivations,
  normalizeProficiency,
  normalizeNativeLang,
  normalizeTargetLang,
};
