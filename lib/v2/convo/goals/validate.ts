import type { ConvoGoal, ConvoGoalBank, ConvoGoalIssue } from './types';

export function validateGoal(
  goal: ConvoGoal,
  pathPrefix = 'goal',
  opts?: { requireAsk?: boolean },
): ConvoGoalIssue[] {
  const issues: ConvoGoalIssue[] = [];
  const p = `${pathPrefix}.${goal.id || '?'}`;

  if (!goal.id?.trim()) {
    issues.push({ path: p, rule: 'shape', message: 'missing id' });
  }
  if (!goal.intent_eg?.trim()) {
    issues.push({ path: p, rule: 'intent', message: 'missing intent_eg' });
  }
  const examples = goal.examples_tl ?? [];
  if (examples.length < 1 || examples.every((e) => !e.trim())) {
    issues.push({
      path: `${p}.examples_tl`,
      rule: 'examples',
      message: 'need at least one example',
    });
  }
  const keywords = goal.keywords ?? [];
  if (keywords.length < 1) {
    issues.push({
      path: `${p}.keywords`,
      rule: 'keywords',
      message: 'need at least one keyword',
    });
  }
  const help = goal.help;
  if (
    !help ||
    !help.frame_tl?.trim() ||
    !help.eg?.trim() ||
    !Array.isArray(help.chips) ||
    help.chips.length < 1
  ) {
    issues.push({
      path: `${p}.help`,
      rule: 'help',
      message: 'help needs frame_tl, eg, and chips',
    });
  }
  if (opts?.requireAsk) {
    if (!goal.ask_tl?.trim()) {
      issues.push({
        path: `${p}.ask_tl`,
        rule: 'ask',
        message: 'missing ask_tl',
      });
    }
    if (!goal.ask_ar?.trim()) {
      issues.push({
        path: `${p}.ask_ar`,
        rule: 'ask',
        message: 'missing ask_ar',
      });
    }
  }
  return issues;
}

export function validateGoals(
  goals: ConvoGoal[],
  opts?: { requireAsk?: boolean },
): {
  ok: boolean;
  issues: ConvoGoalIssue[];
} {
  const issues = goals.flatMap((g, i) =>
    validateGoal(g, `goals[${i}]`, opts),
  );
  const seen = new Set<string>();
  for (let i = 0; i < goals.length; i++) {
    const id = goals[i]?.id?.trim();
    if (!id) continue;
    if (seen.has(id)) {
      issues.push({
        path: `goals[${i}].id`,
        rule: 'shape',
        message: `duplicate goal id: ${id}`,
      });
    }
    seen.add(id);
  }
  return { ok: issues.length === 0, issues };
}

/** Full bank validation for authored / generated lesson-day banks. */
export function validateLessonDayBank(bank: ConvoGoalBank): {
  ok: boolean;
  issues: ConvoGoalIssue[];
} {
  const issues: ConvoGoalIssue[] = [];
  const opening = bank.opening;
  if (!opening?.tl?.trim() || !opening?.ar?.trim()) {
    issues.push({
      path: 'opening',
      rule: 'opening',
      message: 'opening needs tl and ar',
    });
  }
  const goalResult = validateGoals(bank.goals, { requireAsk: true });
  issues.push(...goalResult.issues);
  return { ok: issues.length === 0, issues };
}
