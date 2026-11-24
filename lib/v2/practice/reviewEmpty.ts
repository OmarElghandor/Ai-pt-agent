/**
 * Why /review has nothing to show (16 §3 / §8.2).
 */

export type ReviewEmptyReason =
  | 'current_day_is_1'
  | 'no_completed_before_current'
  | 'empty_steps';

/**
 * Classify an empty review response.
 * `completedDaysAll` = every completed day for the lang (not only day < current).
 */
export function classifyReviewEmpty(opts: {
  currentDay: number;
  completedDaysAll: number[];
  windowLength: number;
  stepsLength?: number;
}): ReviewEmptyReason | null {
  if (opts.windowLength > 0) {
    if ((opts.stepsLength ?? -1) === 0) return 'empty_steps';
    return null;
  }
  const completed = opts.completedDaysAll.filter(
    (d) => Number.isFinite(d) && d >= 1,
  );
  // Gap: e.g. day 2 completed but day 1 missing → currentDay stuck at 1
  if (completed.some((d) => d >= opts.currentDay)) {
    return 'no_completed_before_current';
  }
  if (opts.currentDay <= 1) return 'current_day_is_1';
  return 'no_completed_before_current';
}

/** First day ≥ 1 that is not in the completed set. */
export function firstMissingCompletedDay(completedDays: number[]): number {
  const set = new Set(
    completedDays.filter((d) => Number.isFinite(d) && d >= 1).map(Math.floor),
  );
  let d = 1;
  while (set.has(d)) d += 1;
  return d;
}

/** Learner-facing empty copy (Egyptian Arabic). Never percentages. */
export function reviewEmptyCopyEg(
  reason: ReviewEmptyReason | null | undefined,
  opts?: { completedDays?: number[]; currentDay?: number },
): { title: string; detail: string; ctaDay: number | null } {
  const completed = opts?.completedDays ?? [];
  const currentDay = opts?.currentDay ?? 1;
  const missing = firstMissingCompletedDay(completed);

  if (reason === 'empty_steps') {
    return {
      title: 'المراجعة لسه مش جاهزة',
      detail:
        'الدروس خلصت بس الأسئلة بتاعة المراجعة مش اتبنت. جرّب تاني بعد شوية.',
      ctaDay: currentDay > 0 ? currentDay : null,
    };
  }

  if (reason === 'no_completed_before_current' && completed.some((d) => d > 1)) {
    return {
      title: `خلّص يوم ${missing} كمان`,
      detail:
        'في دروس متقدمة متعلّمة، بس المراجعة محتاجة الدروس بالترتيب من الأول.',
      ctaDay: missing,
    };
  }

  return {
    title: 'خلّص أول درس ونبدأ نراجع سوا',
    detail:
      'المراجعة بتيجي من الدروس اللي خلّصتها في المسار — مش من الدروس المنشورة لوحدها.',
    ctaDay: currentDay > 0 ? currentDay : 1,
  };
}
