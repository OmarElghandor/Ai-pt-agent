import type { ConvoSession } from '@/lib/v2/convo/session/types';
import type { ConvoGoal, ConvoGoalBank, ConvoGoalState } from './types';
import { activeOpenGoals, firstActiveOpenGoalId } from './onlyIf';
import { pendingFrameFromGoal } from './sessionGoals';

export function markGoalsDone(
  states: ConvoGoalState[],
  completedIds: string[],
  as: 'done' | 'assisted' = 'done',
  optionById?: Record<string, string | null | undefined>,
): ConvoGoalState[] {
  if (!completedIds.length) return states;
  const set = new Set(completedIds);
  return states.map((g) => {
    if (!(set.has(g.id) && g.status === 'open')) return g;
    const opt =
      optionById && Object.prototype.hasOwnProperty.call(optionById, g.id)
        ? optionById[g.id]
        : undefined;
    return {
      ...g,
      status: as,
      ...(opt !== undefined ? { option: opt } : {}),
    };
  });
}

export function markGoalsSkipped(
  states: ConvoGoalState[],
  skippedIds: string[],
): ConvoGoalState[] {
  if (!skippedIds.length) return states;
  const set = new Set(skippedIds);
  return states.map((g) =>
    set.has(g.id) && g.status === 'open' ? { ...g, status: 'skipped' } : g,
  );
}

/** Apply a scene DONE match: done/assisted + skipped gaps; reset miss/hint. */
export function applySceneDoneGoals(
  session: ConvoSession,
  bank: ConvoGoalBank,
  doneIds: string[],
  skippedIds: string[],
  opts?: {
    assisted?: boolean;
    learnerGender?: 'm' | 'f';
    /** Option value for the furthest (matched) goal. */
    optionValue?: string | null;
  },
): ConvoGoal[] {
  session.goals = markGoalsSkipped(session.goals, skippedIds);
  const completed = applyCompletedGoals(session, bank, doneIds, opts);
  session.scene_misses = 0;
  session.scene_hint_level = 0;
  session.scene_suggest_shown = false;
  return completed;
}

export function applyCompletedGoals(
  session: ConvoSession,
  bank: ConvoGoalBank,
  completedIds: string[],
  opts?: {
    assisted?: boolean;
    learnerGender?: 'm' | 'f';
    optionValue?: string | null;
  },
): ConvoGoal[] {
  const as = opts?.assisted ? 'assisted' : 'done';
  const beforeCurrent = session.current_goal;
  const optionById: Record<string, string | null | undefined> = {};
  if (completedIds.length && opts && 'optionValue' in opts) {
    const furthest = completedIds[completedIds.length - 1]!;
    optionById[furthest] = opts.optionValue ?? null;
  }
  session.goals = markGoalsDone(session.goals, completedIds, as, optionById);

  const stillCurrentOpen = session.goals.some(
    (g) => g.id === beforeCurrent && g.status === 'open',
  );
  if (!stillCurrentOpen) {
    session.current_goal = firstActiveOpenGoalId(bank, session.goals);
    session.turns_on_goal = 0;
  } else if (completedIds.length === 0) {
    session.turns_on_goal = (session.turns_on_goal ?? 0) + 1;
  }

  const current = bank.goals.find((g) => g.id === session.current_goal);
  if (
    current?.time_of_day &&
    session.scene &&
    session.current_goal !== beforeCurrent
  ) {
    session.scene = {
      ...session.scene,
      time_of_day: current.time_of_day,
    };
  }
  session.pending_frame = pendingFrameFromGoal(
    current,
    opts?.learnerGender ?? 'm',
  );
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
  return activeOpenGoals(bank, session.goals);
}
