import type { ConvoGoal, ConvoGoalBank, ConvoGoalState } from './types';

export function goalStatesFromBank(bank: ConvoGoalBank): ConvoGoalState[] {
  return bank.goals.map((g) => ({ id: g.id, status: 'open' as const }));
}

export function firstOpenGoalId(states: ConvoGoalState[]): string | null {
  return states.find((g) => g.status === 'open')?.id ?? null;
}

export function pendingFrameFromGoal(
  goal: ConvoGoal | undefined,
): { tl: string; eg: string; chips: string[] } | null {
  if (!goal) return null;
  return {
    tl: goal.help.frame_tl,
    eg: goal.help.eg,
    chips: [...goal.help.chips],
  };
}

export function findGoal(
  bank: ConvoGoalBank,
  id: string | null | undefined,
): ConvoGoal | undefined {
  if (!id) return undefined;
  return bank.goals.find((g) => g.id === id);
}
