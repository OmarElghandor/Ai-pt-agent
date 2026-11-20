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
      for (let a = 0; a < g.ask.length; a++) {
        const ask = g.ask[a]!.tl;
        if (ask && !askTlEndsOpen(ask)) {
          issues.push({
            path: `goals[${i}].ask[${a}]`,
            rule: 'ask',
            message:
              'ask must end with a question or an invitation (Diga / Diz)',
          });
        }
      }
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
      });
    }
    if (!g.unclear?.length) {
      issues.push({
        path: `goals[${i}].unclear`,
        rule: 'shape',
        message: 'format 3 goal needs unclear[]',
      });
    }
    if (!g.suggest?.length || g.suggest.length < 2) {
      issues.push({
        path: `goals[${i}].suggest`,
        rule: 'shape',
        message: 'format 3 goal needs 2 suggest chips',
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
      } else if (!seen.has(g.only_if.goal) && g.only_if.goal !== g.id) {
        const prior = goals.some(
          (x, j) => j < i && x.id === g.only_if!.goal,
        );
        if (!prior) {
          issues.push({
            path: `goals[${i}].only_if.goal`,
            rule: 'shape',
            message: `only_if.goal "${g.only_if.goal}" must be an earlier goal`,
          });
        }
      }
    }
  });

  if (bank.end_tips_eg != null) {
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
  }

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

/** Validate a scene goal bank (kind: "scene"). */
export function validateSceneBank(bank: ConvoGoalBank): {
  ok: boolean;
  issues: ConvoGoalIssue[];
} {
  if (bank.format === 3) {
    const issues = validateFormat3SceneBank(bank);
    return { ok: issues.length === 0, issues };
  }

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
