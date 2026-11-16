import type { ConvoGoal, ConvoGoalBank, ConvoGoalState } from './types';

export function goalStatesFromBank(bank: ConvoGoalBank): ConvoGoalState[] {
  return bank.goals.map((g) => ({ id: g.id, status: 'open' as const }));
}

export function firstOpenGoalId(states: ConvoGoalState[]): string | null {
  return states.find((g) => g.status === 'open')?.id ?? null;
}

export function pendingFrameFromGoal(
  goal: ConvoGoal | undefined,
  gender: 'm' | 'f' = 'm',
): { tl: string; eg: string; chips: string[] } | null {
  if (!goal) return null;
  const chips =
    gender === 'f' && goal.help.chips_f?.length
      ? [...goal.help.chips_f]
      : [...goal.help.chips];
  return {
    tl: goal.help.frame_tl,
    eg: goal.help.eg,
    chips,
  };
}

export function findGoal(
  bank: ConvoGoalBank,
  id: string | null | undefined,
): ConvoGoal | undefined {
  if (!id) return undefined;
  return bank.goals.find((g) => g.id === id);
}
