import { isDue } from '@/lib/v2/progress/cards';
import type { ItemState } from '@/lib/v2/progress/types';
import type { TopicStatus } from './types';

function levelsTried(state: ItemState | undefined): boolean {
  if (!state) return false;
  const { heard, understood, said, used } = state.levels;
  return heard > 0 || understood > 0 || said > 0 || used > 0;
}

function isWeak(
  itemId: string,
  state: ItemState | undefined,
  weakIds: ReadonlySet<string>,
): boolean {
  return weakIds.has(itemId) || (state?.weakToolIds?.length ?? 0) > 0;
}

/**
 * Aggregate topic status from v2_item_state (09 §8):
 * ⚪ not tried · 🟡 any due or weak · 🟢 otherwise.
 */
export function topicStatus(
  itemIds: string[],
  statesById: ReadonlyMap<string, ItemState>,
  weakIds: ReadonlySet<string>,
  now: Date = new Date(),
): TopicStatus {
  if (itemIds.length === 0) return 'not_tried';

  let anyTried = false;
  let needsReview = false;
  for (const id of itemIds) {
    const state = statesById.get(id);
    const tried = levelsTried(state);
    if (tried) anyTried = true;
    if (isWeak(id, state, weakIds)) needsReview = true;
    // Due only counts once the learner has tried the item (levels > 0).
    if (tried && state && isDue(state, now)) needsReview = true;
  }

  if (!anyTried) return 'not_tried';
  if (needsReview) return 'needs_review';
  return 'solid';
}

export function statusGlyph(
  status: TopicStatus,
): '🟢' | '🟡' | '⚪' {
  if (status === 'solid') return '🟢';
  if (status === 'needs_review') return '🟡';
  return '⚪';
}
