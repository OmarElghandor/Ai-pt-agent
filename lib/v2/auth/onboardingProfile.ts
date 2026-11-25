/** Shared onboarding profile enums and normalizers (auth UI + PATCH /api/v2/me). */

export const COACH_DIALECTS = ['eg', 'msa', 'levantine', 'gulf'] as const;
export type CoachDialect = (typeof COACH_DIALECTS)[number];

export const MOTIVATION_IDS = [
  'travel',
  'fluency',
  'work',
  'culture',
] as const;
export type MotivationId = (typeof MOTIVATION_IDS)[number];

export const PROFICIENCY_LEVELS = [
  'zero',
  'words',
  'basics',
  'quiz',
] as const;
export type ProficiencyLevel = (typeof PROFICIENCY_LEVELS)[number];

export const DAILY_MINUTES_OPTIONS = [5, 15, 20] as const;
export type DailyMinutesOption = (typeof DAILY_MINUTES_OPTIONS)[number];

export function isCoachDialect(value: unknown): value is CoachDialect {
  return (
    typeof value === 'string' &&
    (COACH_DIALECTS as readonly string[]).includes(value)
  );
}

export function normalizeCoachDialect(value: unknown): CoachDialect | null {
  return isCoachDialect(value) ? value : null;
}

export function isMotivationId(value: unknown): value is MotivationId {
  return (
    typeof value === 'string' &&
    (MOTIVATION_IDS as readonly string[]).includes(value)
  );
}

export function normalizeMotivations(value: unknown): MotivationId[] {
  if (!Array.isArray(value)) return [];
  const out: MotivationId[] = [];
  for (const item of value) {
    if (isMotivationId(item) && !out.includes(item)) out.push(item);
  }
  return out;
}

export function isProficiencyLevel(value: unknown): value is ProficiencyLevel {
  return (
    typeof value === 'string' &&
    (PROFICIENCY_LEVELS as readonly string[]).includes(value)
  );
}

export function normalizeProficiency(value: unknown): ProficiencyLevel | null {
  return isProficiencyLevel(value) ? value : null;
}

export function isDailyMinutesOption(
  value: unknown,
): value is DailyMinutesOption {
  return (
    typeof value === 'number' &&
    (DAILY_MINUTES_OPTIONS as readonly number[]).includes(value)
  );
}

export function normalizeDailyMinutes(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const n = Math.round(value);
  if (n < 5 || n > 120) return null;
  return n;
}
