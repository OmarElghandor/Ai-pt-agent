import type { ItemState } from './types';
import { applyCardRating } from './srs';

function addDaysIso(from: Date, days: number): string {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/**
 * "عارفها" / know: graduate immediately and schedule one check at +21 days.
 */
export function applyKnow(
  state: ItemState,
  now: Date = new Date(),
): ItemState {
  return {
    ...state,
    card: {
      ...state.card,
      masteryLevel: 'mastered',
      interval: Math.max(state.card.interval, 21),
      dueAt: addDaysIso(now, 21),
      knowCheckDueAt: addDaysIso(now, 21),
      consecutiveCorrect: Math.max(state.card.consecutiveCorrect, 1),
    },
  };
}

/**
 * Failed know-check (or failed review while knowCheckDueAt is set):
 * re-enter daily review.
 */
export function failKnowCheck(
  state: ItemState,
  now: Date = new Date(),
): ItemState {
  return {
    ...state,
    card: {
      ...applyCardRating(state.card, 'again', now),
      masteryLevel: 'learning',
      knowCheckDueAt: null,
    },
  };
}

export function isKnowCheckDue(state: ItemState, now: Date = new Date()): boolean {
  if (!state.card.knowCheckDueAt) return false;
  return new Date(state.card.knowCheckDueAt).getTime() <= now.getTime();
}
