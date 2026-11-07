import type { ConvoGoal } from './types';

/** Egyptian / Arabic stuck phrases → start help at step 2. */
const STUCK_RE =
  /^(مش\s*عارف|مش\s*عارفة|مش\s*فاهم|مش\s*فاهمة|ما\s*عرفش|ما\s*افهمش|لا\s*أعرف|لا\s*أفهم)/;

export function isStuckHelpRequest(text: string): boolean {
  const t = text.trim();
  if (!t) return true; // silence
  return STUCK_RE.test(t);
}

export type SteerAction =
  | { kind: 'none' }
  | { kind: 'ask_directly' }
  | {
      kind: 'coach_frame';
      eg: string;
      frame_tl: string;
      chips: string[];
    }
  | {
      kind: 'coach_give_answer';
      eg: string;
      sentence_tl: string;
      mark_assisted: true;
    };

/**
 * Escalation for the current goal after N stuck learner PT turns
 * (turns_on_goal is counted before this turn's completion).
 */
export function steerActionForTurns(
  turnsOnGoal: number,
  goal: ConvoGoal | undefined,
): SteerAction {
  if (!goal) return { kind: 'none' };
  if (turnsOnGoal >= 4) {
    const sentence =
      goal.help.chips[0] ?? goal.examples_tl[0] ?? goal.help.frame_tl;
    return {
      kind: 'coach_give_answer',
      eg: `قولها كده: ${sentence}`,
      sentence_tl: sentence,
      mark_assisted: true,
    };
  }
  if (turnsOnGoal >= 3) {
    return {
      kind: 'coach_frame',
      eg: goal.help.eg,
      frame_tl: goal.help.frame_tl,
      chips: [...goal.help.chips],
    };
  }
  if (turnsOnGoal >= 2) {
    return { kind: 'ask_directly' };
  }
  return { kind: 'none' };
}

/** Help ladder step 2 for مش عارف — frame + chips, never the bare answer alone. */
export function stuckHelpForGoal(goal: ConvoGoal): {
  eg: string;
  frame_tl: string;
  chips: string[];
} {
  return {
    eg: goal.help.eg,
    frame_tl: goal.help.frame_tl,
    chips: [...goal.help.chips],
  };
}
