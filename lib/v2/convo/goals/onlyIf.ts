import type { ConvoGoal, ConvoGoalBank, ConvoGoalState } from './types';

/** Option value recorded when a goal was completed (done/assisted). */
export function completedOptionValue(
  states: ConvoGoalState[],
  goalId: string,
): string | null {
  const st = states.find((g) => g.id === goalId);
  if (!st) return null;
  if (st.status !== 'done' && st.status !== 'assisted') return null;
  return st.option ?? null;
}

/**
 * Format 3 `only_if`: active only when the named goal was completed with
 * one of the listed option values. No only_if → always active.
 */
export function isGoalActive(
  goal: ConvoGoal,
  states: ConvoGoalState[],
): boolean {
  const rule = goal.only_if;
  if (!rule) return true;
  const opt = completedOptionValue(states, rule.goal);
  if (!opt) return false;
  return rule.options.includes(opt);
}

/** Open goals whose only_if is satisfied, in bank order. */
export function activeOpenGoals(
  bank: ConvoGoalBank,
  states: ConvoGoalState[],
): ConvoGoal[] {
  const open = new Set(
    states.filter((g) => g.status === 'open').map((g) => g.id),
  );
  return bank.goals.filter((g) => open.has(g.id) && isGoalActive(g, states));
}

export function firstActiveOpenGoalId(
  bank: ConvoGoalBank,
  states: ConvoGoalState[],
): string | null {
  return activeOpenGoals(bank, states)[0]?.id ?? null;
}

/** Checklist: non-farewell goals that are currently active (or already resolved). */
export function checklistGoals(
  bank: ConvoGoalBank,
  states: ConvoGoalState[],
): ConvoGoal[] {
  const byId = new Map(states.map((g) => [g.id, g]));
  return bank.goals.filter((g) => {
    if (g.farewell) return false;
    const st = byId.get(g.id);
    if (st && (st.status === 'done' || st.status === 'assisted' || st.status === 'skipped')) {
      return true;
    }
    return isGoalActive(g, states);
  });
}
