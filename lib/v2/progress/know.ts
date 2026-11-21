import type { ItemState } from './types';
import { applyCardRating } from './srs';
import { applyStageEvidence } from './stages';

function addDaysIso(from: Date, days: number): string {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/**
 * "عارفها" / know: card SRS check at +21 days; mastery stage stops at 3 (16 §6).
 */
export function applyKnow(
  state: ItemState,
  now: Date = new Date(),
  localDate?: string,
): ItemState {
  const withCard: ItemState = {
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
  const day =
    localDate ??
    `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  return applyStageEvidence(withCard, { kind: 'know', localDate: day });
}

/**
 * Failed know-check (or failed review while knowCheckDueAt is set):
 * re-enter daily review.
 */
export function failKnowCheck(
  state: ItemState,
  now: Date = new Date(),
  localDate?: string,
): ItemState {
  const day =
    localDate ??
    `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  const demoted = applyStageEvidence(
    {
      ...state,
      card: {
        ...applyCardRating(state.card, 'again', now),
        masteryLevel: 'learning',
        knowCheckDueAt: null,
      },
    },
    { kind: 'miss', localDate: day, fromCard: true },
  );
  return demoted;
}

export function isKnowCheckDue(state: ItemState, now: Date = new Date()): boolean {
  if (!state.card.knowCheckDueAt) return false;
  return new Date(state.card.knowCheckDueAt).getTime() <= now.getTime();
}
