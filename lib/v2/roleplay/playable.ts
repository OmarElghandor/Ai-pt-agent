import type { RoleplaySituation, RoleplayStep, RoleplayTier } from './types';

/** Whether a step is active for this tier + slot map. */
export function isStepPlayable(
  step: RoleplayStep,
  tier: RoleplayTier,
  slots: Record<string, string>,
): boolean {
  if (step.min_tier > tier) return false;
  if (step.if_slot) {
    for (const [k, v] of Object.entries(step.if_slot)) {
      if (slots[k] !== v) return false;
    }
  }
  return true;
}

/** Steps playable now (tier + if_slot), in authored order. */
export function playableSteps(
  situation: RoleplaySituation,
  tier: RoleplayTier,
  slots: Record<string, string>,
): RoleplayStep[] {
  return situation.steps.filter((s) => isStepPlayable(s, tier, slots));
}

/** Steps still ahead from `fromStepId` inclusive (or from start if null). */
export function remainingPlayableSteps(
  situation: RoleplaySituation,
  tier: RoleplayTier,
  slots: Record<string, string>,
  fromStepId: string | null,
): RoleplayStep[] {
  const all = playableSteps(situation, tier, slots);
  if (!fromStepId) return all;
  const idx = all.findIndex((s) => s.id === fromStepId);
  if (idx < 0) return all;
  return all.slice(idx);
}
