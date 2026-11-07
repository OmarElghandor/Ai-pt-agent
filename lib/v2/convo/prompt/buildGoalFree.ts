import { GOAL_CONVO_CHARACTER_RULES } from './characterRules';
import type {
  BuildConvoPromptInput,
  BuildConvoPromptResult,
  ConvoPromptPart,
} from './types';
import { convoPromptBudgetTestExtraText } from './build';

function topicBlock(input: BuildConvoPromptInput): string {
  const lines = [`Topic: ${input.freeTopicTitle ?? 'conversa'}.`];
  if (input.freeTopicPlace) {
    lines.push(`Place / scene: ${input.freeTopicPlace}.`);
  }
  if (input.sceneTimeOfDay) {
    lines.push(`Time of day (fixed): ${input.sceneTimeOfDay}. Do not contradict it.`);
  }
  if (input.sceneAddress === 'formal') {
    lines.push(
      'Address form (fixed): formal — use o senhor / a senhora or the verb with no tu pronoun. Never use tu / te / ti / Contigo.',
    );
  } else if (input.sceneAddress === 'tu') {
    lines.push('Address form (fixed): tu (informal).');
  }
  const facts = (input.facts ?? []).slice(0, 5);
  if (facts.length > 0) {
    lines.push(`Facts about the learner: ${facts.join('; ')}`);
  }
  return lines.join('\n');
}

function exchangesBlock(
  exchanges: BuildConvoPromptInput['lastExchanges'],
): string {
  const last = exchanges.slice(-3);
  if (last.length === 0) return '(none yet)';
  return last
    .map((e) => `${e.role === 'character' ? 'Char' : 'Learner'}: ${e.tl}`)
    .join('\n');
}

/**
 * v3 free-talk prompt: part 4 = CURRENT GOAL.
 */
export function buildGoalFreePrompt(
  input: BuildConvoPromptInput,
): BuildConvoPromptResult {
  const persona =
    input.personaJson?.trim() ||
    '{"note":"persona missing"}';
  const characterText = `${persona}\n\n${GOAL_CONVO_CHARACTER_RULES}${convoPromptBudgetTestExtraText()}`;
  const eventLine = input.eventLine?.trim() || 'learner replied';
  const currentGoal =
    input.currentGoalLine?.trim() ||
    '(no open goal — keep chatting naturally)';

  const parts: ConvoPromptPart[] = [
    {
      index: 1,
      label: 'CHARACTER',
      text: characterText,
      cache: true,
    },
    {
      index: 2,
      label: 'TOPIC',
      text: topicBlock(input),
      cache: true,
    },
    {
      index: 3,
      label: 'EVENT',
      text: eventLine,
      cache: false,
    },
    {
      index: 4,
      label: 'CURRENT GOAL',
      text: currentGoal,
      cache: false,
    },
    {
      index: 5,
      label: 'LAST EXCHANGES',
      text: exchangesBlock(input.lastExchanges),
      cache: false,
    },
    {
      index: 6,
      label: 'LEARNER JUST SAID',
      text: input.learnerAnswer.trim() || '(ready)',
      cache: false,
    },
  ];

  const assembled = parts.map((p) => `${p.label}\n${p.text}`).join('\n\n');
  return { parts, assembled };
}

/** Build the CURRENT GOAL one-liner for the prompt. */
export function formatCurrentGoalLine(opts: {
  intentEn: string;
  seedTl?: string;
  askTl?: string;
  goalId: string;
  turnsOnGoal: number;
  openGoalIds: string[];
}): string {
  const share = opts.seedTl?.trim()
    ? ` · you may share: ${opts.seedTl.trim()}`
    : '';
  const ask = opts.askTl?.trim()
    ? ` · open this goal with something like: ${opts.askTl.trim()}`
    : '';
  let steer = `steer toward: ${opts.intentEn}${share}${ask}`;
  if (opts.turnsOnGoal >= 2) {
    steer += ' · ask about it directly now';
  }
  steer += ` · goal id: ${opts.goalId}`;
  if (opts.openGoalIds.length) {
    steer += ` · open ids: ${opts.openGoalIds.join(',')}`;
  }
  return steer;
}

/** Pick ask_tl / ask_ar by learner gender. */
export function pickGoalAskLines(
  goal: { ask_tl?: string; ask_ar?: string; ask_tl_f?: string; ask_ar_f?: string },
  gender: 'm' | 'f' = 'm',
): { tl: string; ar: string } | null {
  const useF = gender === 'f';
  const tl =
    (useF && goal.ask_tl_f?.trim() ? goal.ask_tl_f : goal.ask_tl)?.trim() ?? '';
  const ar =
    (useF && goal.ask_ar_f?.trim() ? goal.ask_ar_f : goal.ask_ar)?.trim() ?? '';
  if (!tl) return null;
  return { tl, ar };
}
