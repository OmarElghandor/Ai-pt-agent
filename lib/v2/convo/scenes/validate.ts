import type {
  ConvoGoal,
  ConvoGoalBank,
  ConvoGoalIssue,
  ConvoGoalState,
  SceneLine,
} from '@/lib/v2/convo/goals/types';
import { checkSceneGoals } from './check';

/**
 * True when ask_tl ends with a question or an answerable invitation
 * («Diga.», «Diz.» — with optional trailing emoji).
 * Farewell goals are exempt at the bank level.
 */
export function askTlEndsOpen(askTl: string): boolean {
  const t = askTl.trim();
  if (!t) return false;
  if (t.includes('?')) return true;
  const core = t
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s]+$/u, '')
    .trim();
  if (/\b(diga|diz)\.?$/i.test(core)) return true;
  return false;
}

/** batch-rp-4: non-farewell ask/unclear must end with «?». */
function endsWithQuestionMark(tl: string): boolean {
  const core = tl
    .trim()
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s]+$/u, '')
    .trim();
  return core.endsWith('?');
}

function endsWithQuestionMarkStrict(tl: string): boolean {
  return endsWithQuestionMark(tl);
}

function lineHasSlash(tl: string): boolean {
  return tl.includes('/');
}

function lineEmptyAr(line: SceneLine | undefined | null): boolean {
  return !line?.ar?.trim();
}

/**
 * States as if the learner is currently on `goal` (earlier goals done).
 * Satisfies `only_if` for the target goal (and later only_if goals) by
 * setting a completing option on the referenced earlier goal.
 */
function statesAtGoal(goals: ConvoGoal[], goalId: string): ConvoGoalState[] {
  const target = goals.find((g) => g.id === goalId);
  const optionByGoal = new Map<string, string>();
  if (target?.only_if?.options?.[0]) {
    optionByGoal.set(target.only_if.goal, target.only_if.options[0]!);
  }
  // Also unlock other only_if goals so jump detection sees them as active.
  for (const g of goals) {
    if (g.only_if?.options?.[0] && !optionByGoal.has(g.only_if.goal)) {
      optionByGoal.set(g.only_if.goal, g.only_if.options[0]!);
    }
  }

  let reached = false;
  return goals.map((g) => {
    if (g.id === goalId) {
      reached = true;
      return { id: g.id, status: 'open' as const };
    }
    if (!reached) {
      return {
        id: g.id,
        status: 'done' as const,
        ...(optionByGoal.has(g.id) ? { option: optionByGoal.get(g.id)! } : {}),
      };
    }
    return { id: g.id, status: 'open' as const };
  });
}

function assertMatchedAtOwnGoal(
  bank: ConvoGoalBank,
  goal: ConvoGoal,
  text: string,
  path: string,
  issues: ConvoGoalIssue[],
): void {
  if (!text.trim()) return;
  const result = checkSceneGoals(
    text,
    bank.goals,
    statesAtGoal(bank.goals, goal.id),
  );
  if (result.kind !== 'DONE') {
    issues.push({
      path,
      rule: 'match',
      message: `not matched by code at its own goal: ${text.slice(0, 60)}`,
    });
    return;
  }
  const goalIdx = bank.goals.findIndex((g) => g.id === goal.id);
  const furthestIdx = bank.goals.findIndex((g) => g.id === result.furthestId);
  if (furthestIdx > goalIdx) {
    issues.push({
      path,
      rule: 'match',
      message: `jumps to later goal ${result.furthestId}: ${text.slice(0, 60)}`,
    });
  } else if (result.furthestId !== goal.id && !result.doneIds.includes(goal.id)) {
    issues.push({
      path,
      rule: 'match',
      message: `matched ${result.furthestId} instead of ${goal.id}: ${text.slice(0, 60)}`,
    });
  }
}

function validateFormat3SceneBank(bank: ConvoGoalBank): ConvoGoalIssue[] {
  const issues: ConvoGoalIssue[] = [];

  if (bank.kind !== 'scene') {
    issues.push({
      path: 'kind',
      rule: 'kind',
      message: 'scene bank needs kind: "scene"',
    });
  }

  const opening = bank.opening_lines ?? [];
  if (!opening.length || !opening[0]?.tl?.trim() || !opening[0]?.ar?.trim()) {
    issues.push({
      path: 'opening',
      rule: 'opening',
      message: 'opening needs at least one {tl, ar}',
    });
  }
  const closing = bank.closing_lines ?? [];
  if (!closing.length || !closing[0]?.tl?.trim() || !closing[0]?.ar?.trim()) {
    issues.push({
      path: 'closing',
      rule: 'closing',
      message: 'closing needs at least one {tl, ar}',
    });
  }
  if (!bank.scene?.character_id?.trim()) {
    issues.push({
      path: 'character_id',
      rule: 'shape',
      message: 'scene needs character_id',
    });
  }
  if (!bank.opening_coach_eg?.trim()) {
    issues.push({
      path: 'opening_coach_eg',
      rule: 'shape',
      message: 'opening_coach_eg is required',
    });
  }
  if (
    !Array.isArray(bank.end_tips_eg) ||
    bank.end_tips_eg.length < 1 ||
    bank.end_tips_eg.length > 2
  ) {
    issues.push({
      path: 'end_tips_eg',
      rule: 'shape',
      message: 'end_tips_eg needs 1–2 tips',
    });
  }
  if (!bank.glossary || bank.glossary.length < 8) {
    issues.push({
      path: 'glossary',
      rule: 'shape',
      message: 'glossary needs ≥ 8 entries',
    });
  }
  if (!bank.global?.greeting?.react?.length) {
    issues.push({
      path: 'global.greeting',
      rule: 'shape',
      message: 'global.greeting needs react',
    });
  }
  if (!bank.global?.thanks?.react?.length) {
    issues.push({
      path: 'global.thanks',
      rule: 'shape',
      message: 'global.thanks needs react',
    });
  }
  if (!bank.global?.side_unknown?.react?.length) {
    issues.push({
      path: 'global.side_unknown',
      rule: 'shape',
      message: 'global.side_unknown needs react',
    });
  }

  const checkLines = (
    lines: SceneLine[] | undefined,
    path: string,
    opts: { requireQuestion?: boolean; forbidQuestion?: boolean },
  ) => {
    for (let i = 0; i < (lines?.length ?? 0); i++) {
      const line = lines![i]!;
      if (lineEmptyAr(line)) {
        issues.push({
          path: `${path}[${i}].ar`,
          rule: 'ar',
          message: 'ar must not be empty',
        });
      }
      if (line.tl && lineHasSlash(line.tl)) {
        issues.push({
          path: `${path}[${i}].tl`,
          rule: 'tl',
          message: 'tl must not contain "/"',
        });
      }
      if (
        opts.requireQuestion &&
        line.tl?.trim() &&
        !endsWithQuestionMarkStrict(line.tl)
      ) {
        issues.push({
          path: `${path}[${i}].tl`,
          rule: 'ask',
          message: 'must end with "?"',
        });
      }
      if (
        opts.forbidQuestion &&
        line.tl?.trim() &&
        endsWithQuestionMarkStrict(line.tl)
      ) {
        issues.push({
          path: `${path}[${i}].tl`,
          rule: 'react',
          message: 'react must not end with "?"',
        });
      }
    }
  };

  checkLines(opening, 'opening', {});
  checkLines(closing, 'closing', {});
  // Global reacts may include a tag question (café: «Está frio hoje, hã?»);
  // the no-«?» rule applies to goal option reacts.
  if (bank.global) {
    checkLines(bank.global.greeting.react, 'global.greeting.react', {});
    checkLines(bank.global.thanks.react, 'global.thanks.react', {});
    checkLines(bank.global.side_unknown.react, 'global.side_unknown.react', {});
  }

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

  const seen = new Set<string>();
  goals.forEach((g, i) => {
    if (!g.id?.trim()) {
      issues.push({
        path: `goals[${i}].id`,
        rule: 'shape',
        message: 'missing id',
      });
    } else if (seen.has(g.id)) {
      issues.push({
        path: `goals[${i}].id`,
        rule: 'shape',
        message: `duplicate goal id: ${g.id}`,
      });
    } else {
      seen.add(g.id);
    }
    if (!g.label_eg?.trim()) {
      issues.push({
        path: `goals[${i}].label_eg`,
        rule: 'shape',
        message: 'scene goal needs label_eg',
      });
    }
    if (!g.ask?.length) {
      issues.push({
        path: `goals[${i}].ask`,
        rule: 'ask',
        message: 'format 3 goal needs ask[]',
      });
    } else if (!g.farewell) {
      checkLines(g.ask, `goals[${i}].ask`, { requireQuestion: true });
    } else {
      checkLines(g.ask, `goals[${i}].ask`, {});
    }
    if (!g.options?.length) {
      issues.push({
        path: `goals[${i}].options`,
        rule: 'shape',
        message: 'format 3 goal needs options[]',
      });
    } else {
      g.options.forEach((opt, oi) => {
        if (!opt.value?.trim()) {
          issues.push({
            path: `goals[${i}].options[${oi}].value`,
            rule: 'shape',
            message: 'option needs value',
          });
        }
        if (!opt.keywords?.length && !opt.examples?.length) {
          issues.push({
            path: `goals[${i}].options[${oi}]`,
            rule: 'keywords',
            message: 'option needs keywords or examples',
          });
        }
        checkLines(opt.react, `goals[${i}].options[${oi}].react`, {
          forbidQuestion: true,
        });
        for (let ei = 0; ei < opt.examples.length; ei++) {
          assertMatchedAtOwnGoal(
            bank,
            g,
            opt.examples[ei]!,
            `goals[${i}].options[${oi}].examples[${ei}]`,
            issues,
          );
        }
      });
    }
    if (!g.unclear?.length) {
      issues.push({
        path: `goals[${i}].unclear`,
        rule: 'shape',
        message: 'format 3 goal needs unclear[]',
      });
    } else if (!g.farewell) {
      checkLines(g.unclear, `goals[${i}].unclear`, { requireQuestion: true });
    } else {
      checkLines(g.unclear, `goals[${i}].unclear`, {});
    }
    if (!g.suggest?.length || g.suggest.length < 2) {
      issues.push({
        path: `goals[${i}].suggest`,
        rule: 'shape',
        message: 'format 3 goal needs 2 suggest chips',
      });
    } else {
      g.suggest.forEach((s, si) => {
        assertMatchedAtOwnGoal(
          bank,
          g,
          s,
          `goals[${i}].suggest[${si}]`,
          issues,
        );
      });
    }
    if (g.suggest_f?.length) {
      g.suggest_f.forEach((s, si) => {
        assertMatchedAtOwnGoal(
          bank,
          g,
          s,
          `goals[${i}].suggest_f[${si}]`,
          issues,
        );
      });
    }
    if (!g.hint_words?.trim()) {
      issues.push({
        path: `goals[${i}].hint_words`,
        rule: 'help',
        message: 'format 3 goal needs hint_words',
      });
    }
    if (g.only_if) {
      if (!g.only_if.goal?.trim() || !g.only_if.options?.length) {
        issues.push({
          path: `goals[${i}].only_if`,
          rule: 'shape',
          message: 'only_if needs goal + options[]',
        });
      } else {
        const prior = goals.find((x, j) => j < i && x.id === g.only_if!.goal);
        if (!prior) {
          issues.push({
            path: `goals[${i}].only_if.goal`,
            rule: 'shape',
            message: `only_if.goal "${g.only_if.goal}" must be an earlier goal`,
          });
        } else {
          const values = new Set(
            (prior.options ?? []).map((o) => o.value),
          );
          for (const v of g.only_if.options) {
            if (!values.has(v)) {
              issues.push({
                path: `goals[${i}].only_if.options`,
                rule: 'shape',
                message: `only_if option "${v}" is not on goal ${prior.id}`,
              });
            }
          }
        }
      }
    }
  });

  if (bank.glossary) {
    bank.glossary.forEach((entry, i) => {
      if (!entry.tl?.trim() || !entry.ar?.length) {
        issues.push({
          path: `glossary[${i}]`,
          rule: 'shape',
          message: 'glossary entry needs ar[] and tl',
        });
      }
    });
  }

  return issues;
}

/** Validate a scene goal bank (kind: "scene"). Format 3 only (batch-rp-4). */
export function validateSceneBank(bank: ConvoGoalBank): {
  ok: boolean;
  issues: ConvoGoalIssue[];
} {
  if (bank.format === 3) {
    const issues = validateFormat3SceneBank(bank);
    return { ok: issues.length === 0, issues };
  }

  return {
    ok: false,
    issues: [
      {
        path: 'format',
        rule: 'format',
        message: 'scene banks must be format: 3',
      },
    ],
  };
}

/** Soft check used by tests — returns open-ask failures only. */
export function sceneOpenAskIssues(goals: ConvoGoal[]): ConvoGoalIssue[] {
  const issues: ConvoGoalIssue[] = [];
  goals.forEach((g, i) => {
    if (g.farewell) return;
    const asks = g.ask?.length
      ? g.ask.map((a) => a.tl)
      : [g.ask_tl?.trim() ?? ''];
    for (const ask of asks) {
      if (ask && !askTlEndsOpen(ask)) {
        issues.push({
          path: `goals[${i}].ask_tl`,
          rule: 'ask',
          message: `does not end open: ${ask.slice(-40)}`,
        });
      }
    }
  });
  return issues;
}
