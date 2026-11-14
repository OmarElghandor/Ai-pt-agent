import type { ProfileLangCode } from './languages';
import { normalizeNativeLang, normalizeTargetLang } from './languages';

export type V2UserRole = 'learner' | 'admin';
export type V2UserGender = 'm' | 'f';
export type { ProfileLangCode };

export type V2UserStreak = {
  current: number;
  best: number;
  last_active_day: string | null;
  missed_days: string[];
};

export type V2User = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: V2UserRole;
  gender: V2UserGender | null;
  native_lang: ProfileLangCode;
  target_lang: ProfileLangCode;
  onboarded_at: Date | string | null;
  langify_user_id: string | null;
  timezone: string | null;
  streak: V2UserStreak | null;
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

export { normalizeNativeLang, normalizeTargetLang };
