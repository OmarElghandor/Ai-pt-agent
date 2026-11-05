import { OPEN_CONVO_CHARACTER_RULES } from './characterRules';
import type {
  BuildConvoPromptInput,
  BuildConvoPromptResult,
  ConvoPromptPart,
} from './types';
import { convoPromptBudgetTestExtraText } from './build';

function topicBlock(input: BuildConvoPromptInput): string {
  const title = input.freeTopicTitle?.trim() || 'open chat';
  const label =
    title === 'open chat' || title === 'Qualquer coisa' ? 'open chat' : title;
  const lines = [`Topic: ${label}.`];
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

const OPEN_NEXT_LINE =
  'You ask the next question yourself: open or either/or, never yes/no, about what the learner just said.';

/**
 * Batch 10 open-mode prompt (أي حاجة + after threads).
 * Same six labelled parts; NEXT LINE tells the model to ask.
 */
export function buildOpenConvoPrompt(
  input: BuildConvoPromptInput,
): BuildConvoPromptResult {
  const persona =
    input.personaJson?.trim() || '{"note":"persona missing"}';
  const characterText = `${persona}\n\n${OPEN_CONVO_CHARACTER_RULES}${convoPromptBudgetTestExtraText()}`;
  const eventLine = input.eventLine?.trim() || 'learner replied';

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
      label: 'NEXT LINE',
      text: OPEN_NEXT_LINE,
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

export { OPEN_NEXT_LINE };
