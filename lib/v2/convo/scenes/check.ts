import type {
  ConvoGoal,
  ConvoGoalState,
  SceneOption,
} from '@/lib/v2/convo/goals/types';
import { isAtLeast80Similar } from './similarity';
import {
  messageHasAnyKeyword,
  messageHasStrongKeyword,
  normalizeSceneText,
} from './weak';

export type SceneMatchResult =
  | {
      kind: 'DONE';
      furthestId: string;
      /** Winning option value on the furthest matched goal (format 3). */
      optionValue: string | null;
      doneIds: string[];
      skippedIds: string[];
    }
  | { kind: 'SIDE' }
  | { kind: 'MISS' };

function openGoalsInBankOrder(
  bankGoals: ConvoGoal[],
  states: ConvoGoalState[],
): ConvoGoal[] {
  const open = new Set(
    states.filter((g) => g.status === 'open').map((g) => g.id),
  );
  return bankGoals.filter((g) => open.has(g.id));
}

function letterCount(text: string): number {
  return (normalizeSceneText(text).match(/\p{L}/gu) ?? []).length;
}

function optionExamplesMatch(
  learnerText: string,
  option: SceneOption,
): boolean {
  return option.examples.some((ex) => isAtLeast80Similar(learnerText, ex));
}

function firstMatchingOption(
  learnerText: string,
  goal: ConvoGoal,
  opts: { allowWeakKeywords: boolean },
): SceneOption | null {
  const options = goal.options;
  if (options?.length) {
    for (const opt of options) {
      const kwHit = opts.allowWeakKeywords
        ? messageHasAnyKeyword(learnerText, opt.keywords)
        : messageHasStrongKeyword(learnerText, opt.keywords);
      if (kwHit || optionExamplesMatch(learnerText, opt)) {
        return opt;
      }
    }
    return null;
  }

  // Format 2 fallback: flat keywords / examples_tl on the goal.
  const kwHit = opts.allowWeakKeywords
    ? messageHasAnyKeyword(learnerText, goal.keywords)
    : messageHasStrongKeyword(learnerText, goal.keywords);
  const exHit = goal.examples_tl.some((ex) =>
    isAtLeast80Similar(learnerText, ex),
  );
  if (kwHit || exHit) {
    return {
      value: goal.id,
      keywords: goal.keywords,
      examples: goal.examples_tl,
      react: [],
    };
  }
  return null;
}

function resolveGoalToken(
  token: string,
  openIds: Set<string>,
): 'side' | 'none' | string {
  const t = token.trim().toLowerCase();
  if (!t || t === 'none' || t === '-') return 'none';
  if (t === 'side') return 'side';
  if (openIds.has(t)) return t;
  for (const id of openIds) {
    if (id === t || id.endsWith(`.${t}`) || id.endsWith(t)) return id;
  }
  return t;
}

function parseGoalLineTarget(
  goalLine: string | null | undefined,
  openIds: Set<string>,
): 'side' | 'none' | string {
  if (goalLine == null) return 'none';
  const raw = goalLine.trim().toLowerCase();
  if (!raw || raw === 'none' || raw === '-') return 'none';
  if (raw === 'side') return 'side';

  const parts = raw
    .split(/[|,]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const lowerParts = parts.map((p) => p.toLowerCase());
  if (
    parts.length >= 3 &&
    lowerParts.includes('side') &&
    lowerParts.includes('none')
  ) {
    return 'none';
  }

  return resolveGoalToken(parts[0] ?? '', openIds);
}

/**
 * Scene goal matching (batch-rp-2 Step B, options-aware for format 3).
 * Code first (keywords / ≥80% examples). Optional model GOAL: only for format 2.
 */
export function checkSceneGoals(
  learnerText: string,
  bankGoals: ConvoGoal[],
  states: ConvoGoalState[],
  opts?: {
    /** Raw GOAL: line value (id | next | side | none) — format 2 only. */
    goalLine?: string | null;
    /** @deprecated use goalLine */
    modelReportedIds?: string[];
  },
): SceneMatchResult & { completedIds: string[] } {
  const t = learnerText.trim();
  if (!t) {
    return { kind: 'MISS', completedIds: [] };
  }

  const openOrdered = openGoalsInBankOrder(bankGoals, states);
  if (!openOrdered.length) {
    return { kind: 'MISS', completedIds: [] };
  }

  const openIds = new Set(openOrdered.map((g) => g.id));
  let goalTarget = parseGoalLineTarget(opts?.goalLine, openIds);
  if (goalTarget === 'none' && opts?.modelReportedIds?.length) {
    const first = opts.modelReportedIds[0];
    if (first === 'side') goalTarget = 'side';
    else if (first && openIds.has(first)) goalTarget = first;
  }

  const current = openOrdered[0]!;
  const matched = new Map<string, string | null>();

  const currentOpt = firstMatchingOption(t, current, {
    allowWeakKeywords: true,
  });
  const currentByModel =
    !current.options?.length &&
    goalTarget === current.id &&
    letterCount(t) >= 2;
  if (currentOpt) {
    matched.set(current.id, currentOpt.value);
  } else if (currentByModel) {
    matched.set(current.id, null);
  }

  for (let i = 1; i < openOrdered.length; i++) {
    const goal = openOrdered[i]!;
    if (goal.farewell) continue;
    const opt = firstMatchingOption(t, goal, { allowWeakKeywords: false });
    if (opt) matched.set(goal.id, opt.value);
  }

  if (matched.size === 0) {
    if (goalTarget === 'side') {
      return { kind: 'SIDE', completedIds: [] };
    }
    return { kind: 'MISS', completedIds: [] };
  }

  let furthestIdx = -1;
  for (let i = 0; i < openOrdered.length; i++) {
    if (matched.has(openOrdered[i]!.id)) furthestIdx = i;
  }
  if (furthestIdx < 0) {
    return { kind: 'MISS', completedIds: [] };
  }

  const doneIds: string[] = [];
  const skippedIds: string[] = [];
  for (let i = 0; i <= furthestIdx; i++) {
    const id = openOrdered[i]!.id;
    if (matched.has(id)) doneIds.push(id);
    else skippedIds.push(id);
  }

  const furthestId = openOrdered[furthestIdx]!.id;
  return {
    kind: 'DONE',
    furthestId,
    optionValue: matched.get(furthestId) ?? null,
    doneIds,
    skippedIds,
    completedIds: doneIds,
  };
}

/** @deprecated look-ahead helper kept for older imports; use checkSceneGoals. */
export function fuzzyMatchesExampleAtLeastTwoWords(
  learnerText: string,
  example: string,
): boolean {
  const words = normalizeSceneText(learnerText).split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  return isAtLeast80Similar(learnerText, example);
}
