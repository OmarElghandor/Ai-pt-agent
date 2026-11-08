import { contentTokens } from '@/lib/v2/convo/free/offTopic';
import { matchesAcceptedForm } from '@/lib/v2/convo/correction/shouldFire';
import type { ConvoGoal } from './types';

function normalizeTl(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Fuzzy: exact accepted form, or example tokens mostly present in the message. */
export function fuzzyMatchesExample(
  learnerText: string,
  example: string,
): boolean {
  if (matchesAcceptedForm(learnerText, [example])) return true;
  const msg = normalizeTl(learnerText);
  const ex = normalizeTl(example);
  if (!msg || !ex) return false;
  if (msg.includes(ex) || ex.includes(msg)) return true;

  const exTokens = contentTokens(example).filter((t) => t.length > 2);
  if (exTokens.length === 0) {
    // Short examples like "Olá!" — check raw token presence.
    const short = normalizeTl(example).split(/\s+/).filter(Boolean);
    return short.length > 0 && short.every((t) => msg.includes(t));
  }
  const msgSet = new Set(contentTokens(learnerText));
  const hits = exTokens.filter((t) => msgSet.has(t)).length;
  // Need most content words from the example (tolerate missing 1 if ≥3 tokens).
  const need =
    exTokens.length <= 2 ? exTokens.length : Math.ceil(exTokens.length * 0.6);
  return hits >= need;
}

export function hasKeywordOverlap(
  learnerText: string,
  keywords: string[],
): boolean {
  if (!keywords.length) return false;
  const msg = normalizeTl(learnerText);
  const msgTokens = new Set(contentTokens(learnerText));
  for (const raw of keywords) {
    const k = normalizeTl(raw);
    if (!k) continue;
    if (msgTokens.has(k)) return true;
    if (k.length >= 2 && msg.includes(k)) return true;
  }
  return false;
}

/**
 * A goal is completed when the message fuzzy-matches an example
 * OR (keyword overlap + enough Portuguese content to count as expressing it).
 * Batch: examples_tl fuzzy + keywords as plausibility.
 */
export function messageCompletesGoal(
  learnerText: string,
  goal: ConvoGoal,
): boolean {
  const t = learnerText.trim();
  if (!t) return false;

  const exampleHit = goal.examples_tl.some((ex) =>
    fuzzyMatchesExample(t, ex),
  );
  if (exampleHit) return true;

  // Keyword-only path for natural paraphrases that still share content words.
  if (!hasKeywordOverlap(t, goal.keywords)) return false;
  const tokens = contentTokens(t);
  // Need at least one strong keyword match and some substance,
  // or a greeting-style short hit already covered by examples.
  return tokens.length >= 1;
}

export type GoalCheckResult = {
  completedIds: string[];
};

/**
 * Match learner text against every open goal (any order; multi-complete).
 */
export function checkGoals(
  learnerText: string,
  openGoals: ConvoGoal[],
): GoalCheckResult {
  const completedIds: string[] = [];
  for (const goal of openGoals) {
    if (messageCompletesGoal(learnerText, goal)) {
      completedIds.push(goal.id);
    }
  }
  return { completedIds };
}

/**
 * Accept a model-reported goal id only if code also finds evidence
 * (keyword or fuzzy example) on the learner message.
 */
export function acceptModelReportedGoals(
  learnerText: string,
  reportedIds: string[],
  openGoals: ConvoGoal[],
): string[] {
  const byId = new Map(openGoals.map((g) => [g.id, g]));
  const out: string[] = [];
  for (const id of reportedIds) {
    const goal = byId.get(id);
    if (!goal) continue;
    if (
      hasKeywordOverlap(learnerText, goal.keywords) ||
      goal.examples_tl.some((ex) => fuzzyMatchesExample(learnerText, ex))
    ) {
      out.push(id);
    }
  }
  return out;
}
