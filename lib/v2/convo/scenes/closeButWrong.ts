/**
 * batch-rp-4: close-but-wrong detection and in-context correction helpers.
 */

import type { ConvoGoal, SceneOption } from '@/lib/v2/convo/goals/types';
import { isAtLeast80Similar } from './similarity';
import {
  accentsOrCedillaMissing,
  findKeywordHitInMessage,
  normalizeSceneText,
  replaceWordInContext,
  type SceneKeywordHit,
} from './weak';

export type CloseButWrongHit = {
  option: SceneOption;
  hit: SceneKeywordHit;
  /** Correctly spelled answer word from the option. */
  answerWord: string;
  /** Learner sentence with the word fixed in context. */
  correctedInContext: string;
};

function optionWords(option: SceneOption): string[] {
  const words = new Set<string>();
  for (const kw of option.keywords) {
    const k = kw.trim();
    if (k) words.add(k);
  }
  for (const ex of option.examples) {
    for (const tok of normalizeSceneText(ex).split(/\s+/).filter(Boolean)) {
      // Prefer authored keyword casing when possible.
      const fromKw = option.keywords.find(
        (k) => normalizeSceneText(k) === tok,
      );
      words.add(fromKw ?? tok);
    }
  }
  return [...words];
}

export function goalOptionAnswerWords(goal: ConvoGoal): string[] {
  const out = new Set<string>();
  for (const opt of goal.options ?? []) {
    for (const w of optionWords(opt)) out.add(w);
  }
  return [...out];
}

/** True when `answerWord` is one of the goal's option keywords/example words. */
export function isAnswerWordInGoal(
  goal: ConvoGoal,
  answerWord: string | null | undefined,
): boolean {
  if (!answerWord?.trim()) return false;
  const needle = normalizeSceneText(answerWord);
  return goalOptionAnswerWords(goal).some(
    (w) => normalizeSceneText(w) === needle,
  );
}

/**
 * Fuzzy-only keyword match on an option, with no exact keyword hit and
 * no ≥80% example match → close-but-wrong.
 */
export function detectCloseButWrong(
  learnerText: string,
  goal: ConvoGoal,
  optionValue: string | null,
): CloseButWrongHit | null {
  const options = goal.options ?? [];
  const preferred =
    (optionValue
      ? options.find((o) => o.value === optionValue)
      : null) ?? null;
  const ordered = preferred
    ? [preferred, ...options.filter((o) => o !== preferred)]
    : options;

  for (const option of ordered) {
    const hit = findKeywordHitInMessage(learnerText, option.keywords);
    if (!hit) continue;
    if (hit.kind === 'exact') return null;
    const exampleHit = option.examples.some((ex) =>
      isAtLeast80Similar(learnerText, ex),
    );
    // Still stop on fuzzy keyword even if an example is near — R4-5 caráo.
    if (hit.kind === 'fuzzy') {
      const answerWord = hit.keyword;
      return {
        option,
        hit,
        answerWord,
        correctedInContext: replaceWordInContext(
          learnerText,
          hit.token,
          answerWord,
        ),
      };
    }
    void exampleHit;
  }
  return null;
}

export type AccentFix = {
  answerWord: string;
  correctedInContext: string;
  hit: SceneKeywordHit;
};

/** Exact keyword match where the learner omitted accents/cedilla. */
export function detectMissingAccentFix(
  learnerText: string,
  goal: ConvoGoal,
  optionValue: string | null,
): AccentFix | null {
  const option =
    (optionValue
      ? goal.options?.find((o) => o.value === optionValue)
      : null) ?? null;
  if (!option) return null;
  const hit = findKeywordHitInMessage(learnerText, option.keywords);
  if (!hit || hit.kind !== 'exact') return null;
  if (!accentsOrCedillaMissing(hit.token, hit.keyword)) return null;
  return {
    answerWord: hit.keyword,
    correctedInContext: replaceWordInContext(
      learnerText,
      hit.token,
      hit.keyword,
    ),
    hit,
  };
}

export function closeButWrongCoachEg(answerWord: string): string {
  return `قصدك **${answerWord}**؟ 🔊 اكتبها صح وجرّب تاني.`;
}
