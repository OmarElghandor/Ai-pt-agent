import type { ItemState } from './types';
import { applyCardRating, situationId, tryGraduate } from './srs';

/**
 * Implicit card reviews: max 1 per item per local calendar day,
 * and none when the curriculum day equals introducedDay.
 * usedCorrectlyIn only counts on a day after introducedDay.
 */
export function canCountSituation(
  state: ItemState,
  curriculumDay: number,
): boolean {
  return curriculumDay > state.introducedDay;
}

export function canImplicitCardReview(
  state: ItemState,
  curriculumDay: number,
  localDate: string,
): boolean {
  if (!canCountSituation(state, curriculumDay)) return false;
  if (state.card.masteryLevel === 'mastered' && !state.card.knowCheckDueAt) {
    return false;
  }
  if (state.lastImplicitReviewLocalDate === localDate) return false;
  return true;
}

export type ImplicitApplyResult = {
  state: ItemState;
  cardReviewed: boolean;
  situationAdded: boolean;
};

/**
 * Correct use in lesson/quiz/practice: maybe bump card as easy (once/local day),
 * maybe add usedCorrectlyIn situation.
 * `skipCardReview` — correct on attempt 2 after a logged miss (no easy bump).
 */
export function applyImplicitCorrectUse(
  state: ItemState,
  opts: {
    curriculumDay: number;
    localDate: string;
    now?: Date;
    skipCardReview?: boolean;
  },
): ImplicitApplyResult {
  const now = opts.now ?? new Date();
  let next = { ...state, usedCorrectlyIn: [...state.usedCorrectlyIn] };
  let situationAdded = false;
  let cardReviewed = false;

  if (canCountSituation(state, opts.curriculumDay)) {
    const sit = situationId(opts.curriculumDay);
    if (!next.usedCorrectlyIn.includes(sit)) {
      next.usedCorrectlyIn.push(sit);
      situationAdded = true;
    }
  }

  if (
    !opts.skipCardReview &&
    canImplicitCardReview(state, opts.curriculumDay, opts.localDate)
  ) {
    next = {
      ...next,
      card: applyCardRating(state.card, 'easy', now),
      lastImplicitReviewLocalDate: opts.localDate,
    };
    cardReviewed = true;
  }

  next = tryGraduate(next);
  return { state: next, cardReviewed, situationAdded };
}

/**
 * Wrong use: push card to front of review (again), clear know check.
 */
export function applyImplicitWrongUse(
  state: ItemState,
  now: Date = new Date(),
): ItemState {
  return {
    ...state,
    card: applyCardRating(state.card, 'again', now),
  };
}
