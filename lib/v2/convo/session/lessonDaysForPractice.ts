import { isV2DevAllowed } from '@/lib/v2/flags';
import { getDayPlan, loadPlan } from '@/lib/v2/generation/lesson/plan';
import { learnerCurrentDay } from '@/lib/v2/progress/learnerDay';

export type PracticeLessonDayRow = {
  day: number;
  title_tl: string;
  title_ar: string;
  character_id: string;
};

/**
 * Lesson days shown under «دروسك» on the practice picker.
 * Completed = days strictly before the learner's current day.
 * In dev, always include days 1–5.
 */
export async function listPracticeLessonDays(
  userId: string | null | undefined,
  opts?: {
    currentDay?: number;
    /** Test seam; defaults to isV2DevAllowed(). */
    isDev?: () => boolean;
  },
): Promise<PracticeLessonDayRow[]> {
  const isDev = opts?.isDev ?? isV2DevAllowed;
  const current =
    opts?.currentDay ??
    (userId ? await learnerCurrentDay(userId) : 1);

  const daySet = new Set<number>();
  for (let d = 1; d < current; d++) daySet.add(d);
  if (isDev()) {
    for (let d = 1; d <= 5; d++) daySet.add(d);
  }

  const plan = loadPlan();
  const maxDay = Math.max(0, ...plan.days.map((d) => d.day));
  const rows: PracticeLessonDayRow[] = [];
  for (const day of [...daySet].sort((a, b) => a - b)) {
    if (day < 1 || (maxDay > 0 && day > maxDay)) continue;
    try {
      const entry = getDayPlan(day);
      rows.push({
        day,
        title_tl: entry.title_tl,
        title_ar: entry.title_ar,
        character_id: entry.generation?.chat_character ?? 'ines',
      });
    } catch {
      /* skip missing plan days */
    }
  }
  return rows;
}
