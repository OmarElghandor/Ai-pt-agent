import { keywordsFromExamples } from './keywords';
import type { ConvoGoal, ConvoGoalState } from './types';
import { firstOpenGoalId, goalStatesFromBank } from './sessionGoals';
import { validateGoals } from './validate';

export const GOALS_DONE_COACH_EG = 'خلّصت أهداف المحادثة 👏';

/** Build up to `count` lightweight goals from weak-item TL surfaces. */
export function goalsFromWeakSurfaces(
  surfaces: string[],
  opts?: { count?: number; topicSlug?: string },
): ConvoGoal[] {
  const count = opts?.count ?? 3;
  const slug = opts?.topicSlug ?? 'weak';
  const goals: ConvoGoal[] = [];
  const seen = new Set<string>();
  for (const raw of surfaces) {
    const tl = raw.trim();
    if (!tl) continue;
    const key = tl.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const id = `${slug}.weak.${goals.length + 1}`;
    const examples = [tl.endsWith('.') || tl.endsWith('!') || tl.endsWith('?') ? tl : `${tl}.`];
    goals.push({
      id,
      intent_eg: `يقول: ${tl}`,
      intent_en: `get the learner to use: ${tl}`,
      examples_tl: examples,
      keywords: keywordsFromExamples(examples),
      help: {
        frame_tl: tl.includes(' ') ? tl.replace(/\S+$/, '___') : `${tl} ___`,
        eg: `جرّب تقول: ${tl}`,
        chips: examples,
      },
    });
    if (goals.length >= count) break;
  }
  const { ok } = validateGoals(goals);
  return ok ? goals : goals.filter((g) => g.keywords.length > 0 && g.examples_tl.length > 0);
}

export type RefillResult = {
  states: ConvoGoalState[];
  newGoals: ConvoGoal[];
  current_goal: string | null;
};

/**
 * After all goals are done: append 3 new goals from weak surfaces.
 * Keeps prior goal states (done/assisted) and adds new open ones.
 */
export function refillSessionGoals(opts: {
  existingStates: ConvoGoalState[];
  existingDefs: ConvoGoal[];
  weakSurfaces: string[];
  topicSlug?: string;
}): RefillResult & { defs: ConvoGoal[] } {
  const newGoals = goalsFromWeakSurfaces(opts.weakSurfaces, {
    count: 3,
    topicSlug: opts.topicSlug,
  });
  if (!newGoals.length) {
    return {
      states: opts.existingStates,
      newGoals: [],
      current_goal: firstOpenGoalId(opts.existingStates),
      defs: opts.existingDefs,
    };
  }
  const newStates = goalStatesFromBank({
    source: 'generated',
    goals: newGoals,
    suggested_words: [],
  });
  const states = [...opts.existingStates, ...newStates];
  return {
    states,
    newGoals,
    current_goal: firstOpenGoalId(states),
    defs: [...opts.existingDefs, ...newGoals],
  };
}
