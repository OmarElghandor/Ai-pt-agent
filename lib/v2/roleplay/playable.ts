import type { RoleplaySituation, RoleplayStep } from './types';

/** Whether a step is active for this slot map (`if_slot` only). */
export function isStepPlayable(
  step: RoleplayStep,
  slots: Record<string, string>,
): boolean {
  if (step.if_slot) {
    for (const [k, v] of Object.entries(step.if_slot)) {
      if (slots[k] !== v) return false;
    }
  }
  return true;
}

/** Steps playable now (`if_slot`), in authored order. */
export function playableSteps(
  situation: RoleplaySituation,
  slots: Record<string, string>,
): RoleplayStep[] {
  return situation.steps.filter((s) => isStepPlayable(s, slots));
}

/** Steps still ahead from `fromStepId` inclusive (or from start if null). */
export function remainingPlayableSteps(
  situation: RoleplaySituation,
  slots: Record<string, string>,
  fromStepId: string | null,
): RoleplayStep[] {
  const all = playableSteps(situation, slots);
  if (!fromStepId) return all;
  const idx = all.findIndex((s) => s.id === fromStepId);
  if (idx < 0) return all;
  return all.slice(idx);
}
