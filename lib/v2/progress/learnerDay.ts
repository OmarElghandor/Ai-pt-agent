import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2LessonProgressModel } from '@/lib/v2/mongo/models';

export const DEFAULT_TARGET_LANG = 'pt-PT';

/** `?day=` seed override. Absent or invalid → null (use the learner's day). */
export function dayOverrideFromSearch(raw: string | null | undefined): number | null {
  if (raw == null || raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

/**
 * Current day = first day that is not completed (16 §3).
 * Pure: completed days → smallest missing positive integer (default 1).
 */
export function currentDayFromCompleted(completedDays: number[]): number {
  const set = new Set(
    completedDays
      .filter((d) => Number.isFinite(d) && d >= 1)
      .map((d) => Math.floor(d)),
  );
  let day = 1;
  while (set.has(day)) day += 1;
  return day;
}

/**
 * Learner's current day from v2_lesson_progress (16 §3).
 * Filtered by target_lang so multi-lang docs don't skew the window.
 */
export async function learnerCurrentDay(
  userId: string,
  targetLang: string = DEFAULT_TARGET_LANG,
): Promise<number> {
  if (!mongoConfigured()) return 1;
  await connectMongo();
  const completed = await V2LessonProgressModel()
    .find({
      user_id: userId,
      target_lang: targetLang,
      status: 'completed',
    })
    .select('day')
    .lean();
  return currentDayFromCompleted(completed.map((d) => Number(d.day)));
}

export async function resolveLearnerDay(
  userId: string,
  override: number | null,
  targetLang: string = DEFAULT_TARGET_LANG,
): Promise<number> {
  if (override != null) return override;
  return learnerCurrentDay(userId, targetLang);
}
