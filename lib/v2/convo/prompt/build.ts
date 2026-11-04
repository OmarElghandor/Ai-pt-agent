import { formatConvoEventLine } from '@/lib/v2/convo/ladder';
import {
  CONVO_CHARACTER_RULES,
  FREE_CONVO_CHARACTER_RULES,
} from './characterRules';
import type {
  BuildConvoPromptInput,
  BuildConvoPromptResult,
  ConvoPromptPart,
} from './types';

function sceneBlock(input: BuildConvoPromptInput): string {
  if (input.module === 'free') {
    const lines = [
      `Topic: ${input.freeTopicTitle ?? 'conversa'}.`,
      `Situation: free chat; keep it light and on topic.`,
    ];
    const facts = (input.facts ?? []).slice(0, 5);
    if (facts.length > 0) {
      lines.push(`Facts: ${facts.join('; ')}`);
    }
    return lines.join('\n');
  }

  const pack = input.pack;
  if (!pack) return 'Scene: (none).';
  const visual =
    input.visualStateSummary ??
    (pack.visual.type === 'map'
      ? `Map route: ${pack.visual.route.map((s) => s.step_id).join(' → ')}.`
      : `Scene card: ${pack.visual.image_key}.`);
  return [
    `Place: ${pack.scene.place}.`,
    `Situation: ${pack.scene.information_gap}`,
    visual,
  ].join('\n');
}

function candidatesBlock(
  candidates: BuildConvoPromptInput['candidates'],
  suggestedWords?: string[],
): string {
  const lines: string[] = [];
  if (candidates.length === 0) {
    lines.push('(no candidates)');
  } else {
    lines.push(...candidates.map((c) => `[${c.id}] ${c.tl}`));
  }
  const words = (suggestedWords ?? []).slice(0, 15);
  if (words.length > 0) {
    lines.push(`Prefer these words: ${words.join(', ')}`);
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
 * Build the six fixed prompt parts in order (09 §5.1).
 * Nothing from §5.2 belongs here. Module C puts facts/suggested words in 2/4.
 */
export function buildConvoPrompt(
  input: BuildConvoPromptInput,
): BuildConvoPromptResult {
  const eventLine =
    input.eventLine ?? formatConvoEventLine(input.event);
  const isFree = input.module === 'free';
  const rules = isFree ? FREE_CONVO_CHARACTER_RULES : CONVO_CHARACTER_RULES;

  const parts: ConvoPromptPart[] = [
    {
      index: 1,
      label: 'character_rules',
      // budgetTestSuffix is a test-only injection (T2.2 intentional fail).
      text: rules + (budgetTestExtra ? `\n${budgetTestExtra()}` : ''),
      cache: true,
    },
    {
      index: 2,
      label: 'scene',
      text: sceneBlock(input),
      cache: true,
    },
    {
      index: 3,
      label: 'event',
      text: eventLine,
      cache: false,
    },
    {
      index: 4,
      label: 'candidates',
      text: candidatesBlock(
        input.candidates,
        isFree ? input.suggestedWords : undefined,
      ),
      cache: false,
    },
    {
      index: 5,
      label: 'last_exchanges',
      text: exchangesBlock(input.lastExchanges),
      cache: false,
    },
    {
      index: 6,
      label: 'learner_answer',
      text: input.learnerAnswer.trim() || '(empty)',
      cache: false,
    },
  ];

  const assembled = parts
    .map((p) => `### ${p.index}. ${p.label}\n${p.text}`)
    .join('\n\n');

  return { parts, assembled };
}

/** Rough token estimate for budget tests (chars/4). */
export function estimateConvoPromptTokens(assembled: string): number {
  return Math.ceil(assembled.length / 4);
}

/**
 * Test-only hook for T2.2: append dynamic text to character rules.
 * Must be cleared in after/finally so CI stays clean.
 */
let budgetTestExtra: (() => string) | null = null;

export function setConvoPromptBudgetTestExtra(
  extra: (() => string) | null,
): void {
  budgetTestExtra = extra;
}
