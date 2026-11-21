/**
 * Sliding practice window of the last 3 completed core lessons (16 §3).
 */

export type WindowLesson = {
  day: number;
  /** 1 = newest in window, 3 = oldest. */
  position: 1 | 2 | 3;
};

export type BuildWindowInput = {
  /** First day that is not completed (the learner's current day). */
  currentDay: number;
  /** Days that are completed (any order). */
  completedDays: number[];
  /** Story / weekly days to skip (no core items). */
  storyDays?: ReadonlySet<number> | readonly number[];
};

const WINDOW_SIZE = 3;

export function buildPracticeWindow(input: BuildWindowInput): WindowLesson[] {
  const story =
    input.storyDays instanceof Set
      ? input.storyDays
      : new Set(input.storyDays ?? []);

  const completed = [...new Set(input.completedDays)]
    .filter((d) => d < input.currentDay && Number.isFinite(d) && d >= 1)
    .filter((d) => !story.has(d))
    .sort((a, b) => b - a);

  const picked = completed.slice(0, WINDOW_SIZE);
  return picked.map((day, i) => ({
    day,
    position: (i + 1) as 1 | 2 | 3,
  }));
}

/** Cards weight by window position: 50 / 30 / 20. */
export function cardsWeightForPosition(position: 1 | 2 | 3): number {
  if (position === 1) return 0.5;
  if (position === 2) return 0.3;
  return 0.2;
}

/**
 * Default phase-1 story days (00 / 04). Pure helper for callers without a path load.
 */
export const PHASE1_STORY_DAYS = new Set([7, 14, 21, 29, 38, 46, 55]);
