import type { ConvoGoal, ConvoGoalBank, ConvoGoalIssue } from '@/lib/v2/convo/goals/types';
import { validateGoals } from '@/lib/v2/convo/goals/validate';

/**
 * True when ask_tl ends with a question or an answerable invitation
 * («Diga.», «Diz.» — with optional trailing emoji).
 * Farewell goals are exempt at the bank level.
 */
export function askTlEndsOpen(askTl: string): boolean {
  const t = askTl.trim();
  if (!t) return false;
  if (t.includes('?')) return true;
  // Strip trailing emoji / spaces, then accept counter invitations.
  const core = t
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s]+$/u, '')
    .trim();
  if (/\b(diga|diz)\.?$/i.test(core)) return true;
  return false;
}

/** Validate a scene goal bank (kind: "scene"). */
export function validateSceneBank(bank: ConvoGoalBank): {
  ok: boolean;
  issues: ConvoGoalIssue[];
} {
  const issues: ConvoGoalIssue[] = [];

  if (bank.kind !== 'scene') {
    issues.push({
      path: 'kind',
      rule: 'kind',
      message: 'scene bank needs kind: "scene"',
    });
  }

  if (!bank.opening?.tl?.trim() || !bank.opening?.ar?.trim()) {
    issues.push({
      path: 'opening',
      rule: 'opening',
      message: 'opening needs tl and ar',
    });
  }
  if (!bank.closing?.tl?.trim() || !bank.closing?.ar?.trim()) {
    issues.push({
      path: 'closing',
      rule: 'closing',
      message: 'closing needs tl and ar',
    });
  }
  if (!bank.scene?.character_id?.trim()) {
    issues.push({
      path: 'scene.character_id',
      rule: 'shape',
      message: 'scene needs character_id',
    });
  }
  if (!bank.scene?.place?.trim()) {
    issues.push({
      path: 'scene.place',
      rule: 'shape',
      message: 'scene needs place (character role in the scene)',
    });
  }

  const goalResult = validateGoals(bank.goals, { requireAsk: true });
  issues.push(...goalResult.issues);

  const goals = bank.goals;
  if (goals.length < 1) {
    issues.push({
      path: 'goals',
      rule: 'shape',
      message: 'scene needs at least one goal',
    });
  } else {
    const last = goals[goals.length - 1];
    if (!last.farewell) {
      issues.push({
        path: `goals[${goals.length - 1}].farewell`,
        rule: 'farewell',
        message: 'last goal must have farewell: true',
      });
    }
    for (let i = 0; i < goals.length - 1; i++) {
      if (goals[i].farewell) {
        issues.push({
          path: `goals[${i}].farewell`,
          rule: 'farewell',
          message: 'only the last goal may be farewell',
        });
      }
    }
  }

  goals.forEach((g, i) => {
    if (!g.label_eg?.trim()) {
      issues.push({
        path: `goals[${i}].label_eg`,
        rule: 'shape',
        message: 'scene goal needs label_eg (mission checklist)',
      });
    }
    if (g.farewell) return;
    const ask = g.ask_tl?.trim() ?? '';
    if (ask && !askTlEndsOpen(ask)) {
      issues.push({
        path: `goals[${i}].ask_tl`,
        rule: 'ask',
        message:
          'ask_tl must end with a question or an invitation (Diga / Diz)',
      });
    }
  });

  return { ok: issues.length === 0, issues };
}

/** Soft check used by tests — returns open-ask failures only. */
export function sceneOpenAskIssues(goals: ConvoGoal[]): ConvoGoalIssue[] {
  const issues: ConvoGoalIssue[] = [];
  goals.forEach((g, i) => {
    if (g.farewell) return;
    const ask = g.ask_tl?.trim() ?? '';
    if (ask && !askTlEndsOpen(ask)) {
      issues.push({
        path: `goals[${i}].ask_tl`,
        rule: 'ask',
        message: `does not end open: ${ask.slice(-40)}`,
      });
    }
  });
  return issues;
}
