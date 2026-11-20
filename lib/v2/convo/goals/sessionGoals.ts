import type { ConvoGoal, ConvoGoalBank, ConvoGoalState } from './types';
import { firstActiveOpenGoalId } from './onlyIf';

/** Minimal session slice for scene goal healing (avoids importing session types). */
export type SceneHealSession = {
  goals: ConvoGoalState[];
  current_goal: string | null;
  scene_misses?: number;
  scene_hint_level?: 0 | 1 | 2 | 3 | 4;
  scene_suggest_shown?: boolean;
  scene_format?: 2 | 3;
  scene_coach_before_consumed?: string[];
  scene_char_bubbles_since_coach?: number;
  scene_coach_ever_shown?: boolean;
  pending_frame: { tl: string; eg: string; chips: string[] } | null;
  pending_question: {
    id: string;
    kind: 'choice' | 'open' | 'recap' | 'help';
    item_id: string;
  } | null;
  last_line_id: string | null;
};

export function goalStatesFromBank(bank: ConvoGoalBank): ConvoGoalState[] {
  return bank.goals.map((g) => ({ id: g.id, status: 'open' as const }));
}

export function firstOpenGoalId(states: ConvoGoalState[]): string | null {
  return states.find((g) => g.status === 'open')?.id ?? null;
}

/**
 * True when every bank goal id appears in session.goals (order may differ).
 * Format-3 café cut-over leaves old `cafe.*` ids in Mongo — those must heal.
 */
export function sceneSessionGoalsMatchBank(
  session: Pick<SceneHealSession, 'goals'>,
  bank: ConvoGoalBank,
): boolean {
  if (!bank.goals.length) return false;
  const have = new Set(session.goals.map((g) => g.id));
  return bank.goals.every((g) => have.has(g.id));
}

/**
 * Remap `cafe.order_drink` → `order_drink` when the stem matches a bank id.
 * Returns null when remapping can't cover the bank (caller should reset).
 */
export function remapSceneGoalStatesToBank(
  states: ConvoGoalState[],
  bank: ConvoGoalBank,
): ConvoGoalState[] | null {
  const byId = new Map(states.map((g) => [g.id, g]));
  const byStem = new Map<string, ConvoGoalState>();
  for (const g of states) {
    const stem = g.id.includes('.')
      ? g.id.slice(g.id.lastIndexOf('.') + 1)
      : g.id;
    if (!byStem.has(stem)) byStem.set(stem, g);
  }
  const out: ConvoGoalState[] = [];
  for (const g of bank.goals) {
    const hit = byId.get(g.id) ?? byStem.get(g.id);
    if (!hit) return null;
    out.push({ id: g.id, status: hit.status });
  }
  return out;
}

/**
 * Align session goal ids with the loaded scene bank (format-3 id rename).
 * Prefer stem remap; otherwise reset all goals to open.
 */
export function healSceneSessionAgainstBank(
  session: SceneHealSession,
  bank: ConvoGoalBank,
  gender: 'm' | 'f' = 'm',
): boolean {
  const bankFormat = bank.format ?? 2;
  if (
    session.scene_format != null &&
    session.scene_format !== bankFormat
  ) {
    session.goals = goalStatesFromBank(bank);
    session.scene_misses = 0;
    session.scene_hint_level = 0;
    session.scene_suggest_shown = false;
    session.scene_coach_before_consumed = [];
    session.scene_char_bubbles_since_coach = 0;
    session.scene_coach_ever_shown = false;
    session.scene_format = bankFormat;
    session.current_goal = firstActiveOpenGoalId(bank, session.goals);
    const current = bank.goals.find((g) => g.id === session.current_goal);
    session.pending_frame = pendingFrameFromGoal(current, gender);
    if (session.current_goal) {
      session.pending_question = {
        id: session.current_goal,
        kind: 'open',
        item_id: session.current_goal,
      };
      session.last_line_id = session.current_goal;
    }
    return true;
  }
  if (session.scene_format == null && bank.format) {
    session.scene_format = bank.format;
  }

  if (sceneSessionGoalsMatchBank(session, bank)) {
    if (
      session.current_goal &&
      !bank.goals.some((g) => g.id === session.current_goal)
    ) {
      session.current_goal = firstActiveOpenGoalId(bank, session.goals);
      return true;
    }
    return false;
  }
  const remapped = remapSceneGoalStatesToBank(session.goals, bank);
  if (remapped) {
    session.goals = remapped;
  } else {
    session.goals = goalStatesFromBank(bank);
    session.scene_misses = 0;
    session.scene_hint_level = 0;
    session.scene_suggest_shown = false;
  }
  session.current_goal = firstActiveOpenGoalId(bank, session.goals);
  const current = bank.goals.find((g) => g.id === session.current_goal);
  session.pending_frame = pendingFrameFromGoal(current, gender);
  if (session.current_goal) {
    session.pending_question = {
      id: session.current_goal,
      kind: 'open',
      item_id: session.current_goal,
    };
    session.last_line_id = session.current_goal;
  }
  return true;
}

export function pendingFrameFromGoal(
  goal: ConvoGoal | undefined,
  gender: 'm' | 'f' = 'm',
): { tl: string; eg: string; chips: string[] } | null {
  if (!goal) return null;
  // Format 3: no automatic chips — suggests appear only after mistakes.
  if (goal.hint_words || goal.hints || goal.ask?.length) {
    return {
      tl: goal.hints?.frame_tl || goal.suggest?.[0] || goal.ask_tl || '',
      eg: goal.hints?.what_eg || goal.hint_words || '',
      chips: [],
    };
  }
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
