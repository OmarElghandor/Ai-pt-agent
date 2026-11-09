import { FREE_CONVO_CHARACTER_RULES } from './characterRules';
import type {
  BuildConvoPromptInput,
  BuildConvoPromptResult,
  ConvoPromptPart,
} from './types';
import {
  convoPromptBudgetTestExtraText,
  estimateConvoPromptTokens,
} from './build';

function topicBlock(input: BuildConvoPromptInput): string {
  const lines = [`Topic: ${input.freeTopicTitle ?? 'conversa'}.`];
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
 * Batch 9 C4 free-chat reaction prompt.
 * Six labelled parts; labels appear in the model-visible text.
 */
export function buildFreeReactionPrompt(
  input: BuildConvoPromptInput,
): BuildConvoPromptResult {
  const persona =
    input.personaJson?.trim() ||
    '{"note":"persona missing"}';
  const characterText = `${persona}\n\n${FREE_CONVO_CHARACTER_RULES}${convoPromptBudgetTestExtraText()}`;
  const eventLine = input.eventLine?.trim() || 'learner replied';
  const nextLine = input.nextLineTl?.trim() || '(next line pending)';

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
      text: nextLine,
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

  const assembled = parts
    .map((p) => `${p.label}\n${p.text}`)
    .join('\n\n');

  return { parts, assembled };
}

/** Split free prompt into cached system + dynamic user (labels kept). */
export function freePromptPartsToMessages(assembledParts: {
  parts: ConvoPromptPart[];
}): { system: string; prompt: string } {
  const system = assembledParts.parts
    .filter((p) => p.cache)
    .map((p) => `${p.label}\n${p.text}`)
    .join('\n\n');
  const prompt = assembledParts.parts
    .filter((p) => !p.cache)
    .map((p) => `${p.label}\n${p.text}`)
    .join('\n\n');
  return { system, prompt };
}

export function estimateFreePromptTokens(system: string, prompt: string): number {
  return estimateConvoPromptTokens(`${system}\n${prompt}`);
}
