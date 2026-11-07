import type { ConvoSession } from '@/lib/v2/convo/session/types';
import type { ConvoGoal, ConvoGoalBank, ConvoGoalState } from './types';
import { firstOpenGoalId, pendingFrameFromGoal } from './sessionGoals';

export function markGoalsDone(
  states: ConvoGoalState[],
  completedIds: string[],
  as: 'done' | 'assisted' = 'done',
): ConvoGoalState[] {
  if (!completedIds.length) return states;
  const set = new Set(completedIds);
  return states.map((g) =>
    set.has(g.id) && g.status === 'open' ? { ...g, status: as } : g,
  );
}

export function applyCompletedGoals(
  session: ConvoSession,
  bank: ConvoGoalBank,
  completedIds: string[],
  opts?: { assisted?: boolean },
): ConvoGoal[] {
  const as = opts?.assisted ? 'assisted' : 'done';
  const beforeCurrent = session.current_goal;
  session.goals = markGoalsDone(session.goals, completedIds, as);

  const stillCurrentOpen = session.goals.some(
    (g) => g.id === beforeCurrent && g.status === 'open',
  );
  if (!stillCurrentOpen) {
    session.current_goal = firstOpenGoalId(session.goals);
    session.turns_on_goal = 0;
  } else if (completedIds.length === 0) {
    session.turns_on_goal = (session.turns_on_goal ?? 0) + 1;
  }

  const current = bank.goals.find((g) => g.id === session.current_goal);
  session.pending_frame = pendingFrameFromGoal(current);
  if (session.current_goal) {
    session.pending_question = {
      id: session.current_goal,
      kind: 'open',
      item_id: session.current_goal,
    };
    session.last_line_id = session.current_goal;
  }
  session.assisted = false;
  return bank.goals.filter((g) => completedIds.includes(g.id));
}

export function openGoalsFromSession(
  session: ConvoSession,
  bank: ConvoGoalBank,
): ConvoGoal[] {
  const open = new Set(
    session.goals.filter((g) => g.status === 'open').map((g) => g.id),
  );
  return bank.goals.filter((g) => open.has(g.id));
}
