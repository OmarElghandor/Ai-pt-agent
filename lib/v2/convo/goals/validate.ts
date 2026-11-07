import type { ConvoGoal, ConvoGoalIssue } from './types';

export function validateGoal(
  goal: ConvoGoal,
  pathPrefix = 'goal',
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
  return issues;
}

export function validateGoals(goals: ConvoGoal[]): {
  ok: boolean;
  issues: ConvoGoalIssue[];
} {
  const issues = goals.flatMap((g, i) => validateGoal(g, `goals[${i}]`));
  return { ok: issues.length === 0, issues };
}
