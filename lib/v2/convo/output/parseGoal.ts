import {
  findBrazilianLeak,
  findEnglishLeak,
  findUnknownWords,
  wordCount,
  type ConvoOutputIssue,
} from './checks';
import {
  checkArScript,
  checkPtScript,
  scriptIssueReason,
  type ScriptIssue,
} from './scriptGuard';
import { visibleFreeStreamText } from './parseFree';

export const GOAL_CONVO_MAX_WORDS = 24;

export type GoalParseExtraIssue =
  | 'missing_ar'
  | 'missing_question'
  | 'formal'
  | 'not_arabic'
  | ScriptIssue;

export type ParseGoalConvoResult = {
  pt: string;
  ar: string;
  /** Goal ids from GOALS: line; empty if missing or `-`. */
  reported_goal_ids: string[];
  goals_missing: boolean;
  issues: ConvoOutputIssue[];
  extraIssues: GoalParseExtraIssue[];
  decision: 'ok' | 'regenerate' | 'drop';
  regenerateReason?: string;
  unknownWords: string[];
};

const FORMAL_RE = /\b(você|a sua|o seu|os seus|as suas)\b/i;

/**
 * Split PT / AR: / GOALS: from model output.
 * Tolerates missing GOALS and unknown ids (caller filters).
 */
export function splitGoalMarkers(text: string): {
  pt: string;
  ar: string | null;
  goalsRaw: string | null;
} {
  let s = text.replace(/\r\n/g, '\n').trim();
  // Drop leading PT: label if present.
  s = s.replace(/^PT\s*:\s*/i, '');

  const goalsMatch = s.match(/\n?\s*GOALS\s*:\s*([^\n]*)/i);
  let goalsRaw: string | null = null;
  if (goalsMatch && goalsMatch.index != null) {
    goalsRaw = goalsMatch[1]?.trim() ?? '';
    s = s.slice(0, goalsMatch.index).trimEnd();
  }

  const arMatch = s.match(/\n?\s*AR\s*:\s*([\s\S]*)$/i);
  let ar: string | null = null;
  let pt = s;
  if (arMatch && arMatch.index != null) {
    ar = (arMatch[1] ?? '').trim();
    // Strip nested GOALS if model put it under AR
    const nested = ar.match(/\n?\s*GOALS\s*:\s*([^\n]*)/i);
    if (nested && nested.index != null) {
      if (goalsRaw == null) goalsRaw = nested[1]?.trim() ?? '';
      ar = ar.slice(0, nested.index).trim();
    }
    pt = s.slice(0, arMatch.index).trim();
  }

  pt = pt.replace(/^PT\s*:\s*/i, '').trim();
  return { pt, ar, goalsRaw };
}

export function parseReportedGoalIds(raw: string | null): {
  ids: string[];
  missing: boolean;
} {
  if (raw == null) return { ids: [], missing: true };
  const t = raw.trim();
  if (!t || t === '-' || t.toLowerCase() === 'none') {
    return { ids: [], missing: false };
  }
  const ids = t
    .split(/[,|]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  return { ids, missing: false };
}

export function parseGoalConvoTurn(
  text: string,
  opts?: { knownWords?: string[] },
): ParseGoalConvoResult {
  const { pt: rawPt, ar, goalsRaw } = splitGoalMarkers(text);
  const { ids, missing } = parseReportedGoalIds(goalsRaw);
  const pt = rawPt.trim();

  const issues: ConvoOutputIssue[] = [];
  const extraIssues: GoalParseExtraIssue[] = [];

  if (ar == null || !ar.trim()) {
    extraIssues.push('missing_ar');
  } else {
    const arIssue = checkArScript(ar);
    if (arIssue) {
      extraIssues.push(arIssue === 'ar_not_arabic' ? 'not_arabic' : arIssue);
    }
  }
  const ptIssue = checkPtScript(pt);
  if (ptIssue) extraIssues.push(ptIssue);

  if (!/\?/.test(pt)) {
    extraIssues.push('missing_question');
  }
  if (FORMAL_RE.test(pt)) extraIssues.push('formal');
  if (findBrazilianLeak(pt)) issues.push('brazilian');
  if (findEnglishLeak(pt)) issues.push('english');
  if (wordCount(pt) > GOAL_CONVO_MAX_WORDS) issues.push('length');

  const reasons: string[] = [];
  if (issues.includes('brazilian')) {
    reasons.push('use European Portuguese only');
  }
  if (issues.includes('english')) {
    reasons.push('no English in the PT line');
  }
  if (issues.includes('length')) {
    reasons.push(`keep the PT line under ${GOAL_CONVO_MAX_WORDS} words`);
  }
  if (extraIssues.includes('missing_ar')) {
    reasons.push('add AR: with the Arabic translation');
  }
  if (extraIssues.includes('missing_question')) {
    reasons.push('end with exactly one question');
  }
  if (extraIssues.includes('formal')) {
    reasons.push('use tu forms only');
  }
  for (const issue of [
    'not_arabic',
    'ar_not_arabic',
    'cjk',
    'cyrillic',
    'forbidden_script',
    'pt_not_latin',
  ] as const) {
    if (extraIssues.includes(issue as GoalParseExtraIssue)) {
      reasons.push(scriptIssueReason(issue as ScriptIssue));
    }
  }

  const decision =
    issues.length === 0 &&
    !extraIssues.some(
      (e) =>
        e === 'missing_ar' ||
        e === 'missing_question' ||
        e === 'formal' ||
        e === 'not_arabic' ||
        e === 'ar_not_arabic' ||
        e === 'cjk' ||
        e === 'cyrillic' ||
        e === 'forbidden_script' ||
        e === 'pt_not_latin',
    )
      ? 'ok'
      : 'regenerate';

  return {
    pt,
    ar: ar?.trim() ?? '',
    reported_goal_ids: ids,
    goals_missing: missing,
    issues,
    extraIssues,
    decision,
    ...(reasons.length ? { regenerateReason: reasons.join('; ') } : {}),
    unknownWords: findUnknownWords(pt, opts?.knownWords),
  };
}

/** Stream filter: hide AR: and GOALS: while streaming. */
export function visibleGoalStreamText(accumulated: string): string {
  let s = visibleFreeStreamText(accumulated);
  const goalsCut = s.search(/\s*GOALS\s*:/i);
  if (goalsCut >= 0) {
    s = s.slice(0, goalsCut);
  } else {
    const partial = s.match(/(?:\n|\s)(G|GO|GOA|GOAL|GOALS)\s*:?\s*$/i);
    if (partial && partial.index != null) {
      s = s.slice(0, partial.index);
    }
  }
  return s.trimEnd();
}
