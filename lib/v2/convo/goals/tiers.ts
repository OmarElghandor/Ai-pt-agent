import type { ConvoGoal, ConvoGoalBank, ConvoGoalState } from './types';

export function goalTier(goal: ConvoGoal): 'core' | 'extended' {
  return goal.tier === 'extended' ? 'extended' : 'core';
}

export function coreGoals(bank: ConvoGoalBank): ConvoGoal[] {
  return bank.goals.filter((g) => goalTier(g) === 'core');
}

export function extendedGoals(bank: ConvoGoalBank): ConvoGoal[] {
  return bank.goals.filter((g) => goalTier(g) === 'extended');
}

export function allTierDone(
  states: ReadonlyArray<ConvoGoalState>,
  defs: ReadonlyArray<ConvoGoal>,
  tier: 'core' | 'extended',
): boolean {
  const ids = new Set(
    defs.filter((g) => goalTier(g) === tier).map((g) => g.id),
  );
  if (ids.size === 0) return true;
  for (const id of ids) {
    const st = states.find((s) => s.id === id);
    if (!st || st.status === 'open') return false;
  }
  return true;
}

/** Minimum core goals for a v4 topic bank (day-1 has 5). */
export const MIN_CORE_GOALS = 4;

export const CORE_DONE_COACH_EG = 'الأهداف المهمة خلصت';
