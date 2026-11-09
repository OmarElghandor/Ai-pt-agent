import type { ConvoPackData } from '@/lib/v2/convo/pack';
import type { ItemState } from '@/lib/v2/progress/types';
import type { ConvoRung } from './types';

const GROUP_DONE: ReadonlySet<ConvoRung> = new Set([
  'understood',
  'said',
  'assisted',
]);

function allItemIds(pack: ConvoPackData): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const g of pack.groups) {
    for (const id of g.item_ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Map v2_item_state levels → session rung for replay (09 §3 / T6.3).
 * - said → said (open questions, no card)
 * - understood → heard (choice / 👆 entry; no card)
 * - heard → heard
 * - else taught
 */
export function rungFromItemState(
  state: ItemState | undefined,
): ConvoRung {
  if (!state) return 'taught';
  const { said, understood, heard } = state.levels;
  if (said >= 1) return 'said';
  if (understood >= 1) return 'heard';
  if (heard >= 1) return 'heard';
  return 'taught';
}

export function rungsFromItemStates(
  pack: ConvoPackData,
  statesById: ReadonlyMap<string, ItemState>,
): Record<string, ConvoRung> {
  const rungs: Record<string, ConvoRung> = {};
  for (const id of allItemIds(pack)) {
    rungs[id] = rungFromItemState(statesById.get(id));
  }
  return rungs;
}

export function isReviewSeed(rungs: Record<string, ConvoRung>): boolean {
  return Object.values(rungs).some((r) => r !== 'taught');
}

/**
 * Highest 1-based group the learner may work in: advance while every prior
 * group is at understood+ (same gate as live play).
 */
export function initialCurrentGroup(
  pack: ConvoPackData,
  rungs: Record<string, ConvoRung>,
): number {
  if (pack.groups.length === 0) return 1;
  let group = 1;
  while (group < pack.groups.length) {
    const ids = pack.groups[group - 1]?.item_ids ?? [];
    const done =
      ids.length > 0 &&
      ids.every((id) => GROUP_DONE.has(rungs[id] ?? 'taught'));
    if (!done) break;
    group += 1;
  }
  return group;
}
