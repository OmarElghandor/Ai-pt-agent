import type { ConvoGoal } from './types';

/**
 * A2 stuck / help (§3 / §4): مش عارف, مش فاهم أعمل إيه, ساعدني.
 * Bare مش فاهم is A3 (repeat), not stuck.
 */
const STUCK_RE =
  /^(مش\s*عارف|مش\s*عارفة|مش\s*فاهم\s*أعمل\s*إيه|مش\s*فاهم\s*اعمل\s*ايه|ما\s*عرفش|ما\s*افهمش|لا\s*أعرف|لا\s*أفهم|ساعدني|تلميح|💡\s*تلميح)/;

export function isStuckHelpRequest(text: string): boolean {
  const t = text.trim();
  if (!t) return true; // silence / empty STT
  return STUCK_RE.test(t);
}

/** Scene hint level 1: help.eg + 2 chips. */
export function sceneHintLevel1(
  goal: ConvoGoal,
  gender: 'm' | 'f' = 'm',
): { eg: string; frame_tl: string; chips: string[] } {
  const help = stuckHelpForGoal(goal, gender);
  return {
    eg: help.eg,
    frame_tl: help.frame_tl,
    chips: help.chips.slice(0, 2),
  };
}

/** Scene hint level 2: frame_tl as the single chip. */
export function sceneHintLevel2(
  goal: ConvoGoal,
): { eg: string; frame_tl: string; chips: string[] } {
  return {
    eg: goal.help.eg,
    frame_tl: goal.help.frame_tl,
    chips: [goal.help.frame_tl],
  };
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
  gender: 'm' | 'f' = 'm',
): SteerAction {
  if (!goal) return { kind: 'none' };
  const chips =
    gender === 'f' && goal.help.chips_f?.length
      ? [...goal.help.chips_f]
      : [...goal.help.chips];
  if (turnsOnGoal >= 4) {
    const sentence =
      chips[0] ?? goal.examples_tl[0] ?? goal.help.frame_tl;
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
      chips,
    };
  }
  if (turnsOnGoal >= 2) {
    return { kind: 'ask_directly' };
  }
  return { kind: 'none' };
}

/** Help ladder step 2 for مش عارف — frame + chips, never the bare answer alone. */
export function stuckHelpForGoal(
  goal: ConvoGoal,
  gender: 'm' | 'f' = 'm',
): {
  eg: string;
  frame_tl: string;
  chips: string[];
} {
  const chips =
    gender === 'f' && goal.help.chips_f?.length
      ? [...goal.help.chips_f]
      : [...goal.help.chips];
  return {
    eg: goal.help.eg,
    frame_tl: goal.help.frame_tl,
    chips,
  };
}
