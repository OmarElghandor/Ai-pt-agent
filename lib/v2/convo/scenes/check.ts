import { contentTokens } from '@/lib/v2/convo/free/offTopic';
import {
  acceptModelReportedGoals,
  fuzzyMatchesExample,
  messageCompletesGoal,
} from '@/lib/v2/convo/goals/check';
import type { ConvoGoal, ConvoGoalState } from '@/lib/v2/convo/goals/types';

function normalizeTl(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Shared politeness / greeting tokens that must not alone look-ahead-complete a goal. */
const LOOKAHEAD_WEAK = new Set([
  'por',
  'favor',
  'sim',
  'nao',
  'não',
  'bom',
  'boa',
  'dia',
  'tarde',
  'noite',
  'ola',
  'olá',
  'obrigado',
  'obrigada',
  'tudo',
  'isto',
  'so',
  'só',
  'um',
  'uma',
]);

/**
 * Look-ahead only: fuzzy example match with ≥2 learner words AND ≥2 strong
 * content tokens from the example (blocks «por favor» → «Aqui, por favor.»).
 */
export function fuzzyMatchesExampleAtLeastTwoWords(
  learnerText: string,
  example: string,
): boolean {
  const words = normalizeTl(learnerText).split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  if (!fuzzyMatchesExample(learnerText, example)) return false;

  const strongEx = contentTokens(example).filter(
    (t) => t.length > 2 && !LOOKAHEAD_WEAK.has(t),
  );
  if (strongEx.length === 0) {
    // Example is only weak words — require the full normalised example in the message.
    return normalizeTl(learnerText).includes(normalizeTl(example));
  }
  const msgSet = new Set(contentTokens(learnerText));
  const hits = strongEx.filter((t) => msgSet.has(t));
  return hits.length >= Math.min(2, strongEx.length);
}

function openGoalsInBankOrder(
  bankGoals: ConvoGoal[],
  states: ConvoGoalState[],
): ConvoGoal[] {
  const open = new Set(
    states.filter((g) => g.status === 'open').map((g) => g.id),
  );
  return bankGoals.filter((g) => open.has(g.id));
}

/**
 * Scene goal matching is ordered (batch-rp-2):
 * - Current goal: keywords / fuzzy / model GOALS (full messageCompletesGoal).
 * - Later goals in sequence: only fuzzy example (≥2 words) or model GOALS —
 *   never bare keywords. Stop at the first miss (no skipping).
 * - Farewell completes only when it is the current goal.
 */
export function checkSceneGoals(
  learnerText: string,
  bankGoals: ConvoGoal[],
  states: ConvoGoalState[],
  opts?: { modelReportedIds?: string[] },
): { completedIds: string[] } {
  const t = learnerText.trim();
  if (!t) return { completedIds: [] };

  const openOrdered = openGoalsInBankOrder(bankGoals, states);
  if (!openOrdered.length) return { completedIds: [] };

  const modelAccepted = new Set(
    acceptModelReportedGoals(
      t,
      opts?.modelReportedIds ?? [],
      openOrdered,
    ),
  );

  const completedIds: string[] = [];
  const current = openOrdered[0];

  const currentDone =
    messageCompletesGoal(t, current) || modelAccepted.has(current.id);
  if (!currentDone) return { completedIds: [] };
  completedIds.push(current.id);

  // Farewell never look-ahead-completes; if it was current and done, stop.
  if (current.farewell) return { completedIds };

  for (let i = 1; i < openOrdered.length; i++) {
    const goal = openOrdered[i];
    if (goal.farewell) break;

    const lookAhead =
      modelAccepted.has(goal.id) ||
      goal.examples_tl.some((ex) =>
        fuzzyMatchesExampleAtLeastTwoWords(t, ex),
      );
    if (!lookAhead) break;
    completedIds.push(goal.id);
  }

  return { completedIds };
}
