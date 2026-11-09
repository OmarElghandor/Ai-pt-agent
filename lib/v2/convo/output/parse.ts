import {
  CONVO_REACTION_MAX_WORDS,
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
  splitReactionAr,
  type ScriptIssue,
} from './scriptGuard';
import { consumeConvoTag } from './tag';

export type ConvoParseDecision = 'ok' | 'regenerate' | 'drop';

export type ParseConvoReactionResult = {
  candidateId: string;
  reaction: string;
  /** Optional AR from model (when present after AR: split). */
  reaction_ar?: string;
  issues: ConvoOutputIssue[];
  scriptIssues?: ScriptIssue[];
  decision: ConvoParseDecision;
  regenerateReason?: string;
  unknownWords: string[];
};

/** Strip a trailing / embedded question the model shouldn't have asked. */
export function stripReactionQuestions(text: string): string {
  let t = text.trim();
  // Remove trailing question sentence
  t = t.replace(/[^.!?]*\?\s*$/u, '').trim();
  // Drop any remaining question-bearing clauses
  if (t.includes('?')) {
    const parts = t.split(/(?<=[.!])\s+/);
    t = parts.filter((p) => !p.includes('?')).join(' ').trim();
  }
  return t;
}

function decisionFor(
  issues: ConvoOutputIssue[],
  scriptIssues: ScriptIssue[],
): Pick<ParseConvoReactionResult, 'decision' | 'regenerateReason'> {
  if (issues.length === 0 && scriptIssues.length === 0) {
    return { decision: 'ok' };
  }
  const reasons: string[] = [];
  if (issues.includes('brazilian')) {
    reasons.push('you used a Brazilian form; say it in European Portuguese');
  }
  if (issues.includes('english')) {
    reasons.push('you used English; reply in Portuguese only');
  }
  if (issues.includes('length')) {
    reasons.push(
      `the reaction is longer than ${CONVO_REACTION_MAX_WORDS} words; shorten it`,
    );
  }
  for (const s of scriptIssues) {
    reasons.push(scriptIssueReason(s));
  }
  return {
    decision: 'regenerate',
    regenerateReason: reasons.join('; '),
  };
}

/**
 * Parse Module A model output: leading candidate tag + reaction (09 §5.3–5.4).
 * Splits AR: anywhere; rejects forbidden scripts. Unknown words flagged, not rejected.
 */
export function parseConvoReaction(
  text: string,
  candidateIds: string[],
  opts?: { knownWords?: string[] },
): ParseConvoReactionResult {
  const fallbackId = candidateIds[0] ?? '';
  const consumed = consumeConvoTag(text, candidateIds);

  let candidateId = fallbackId;
  if (consumed.complete && consumed.tag !== null) {
    candidateId = candidateIds.includes(consumed.tag)
      ? consumed.tag
      : fallbackId;
  } else if (consumed.complete && consumed.tag === null) {
    candidateId = fallbackId;
  }

  const body =
    consumed.complete
      ? consumed.rest
      : text.replace(/^\s*\[[^\]]*\]?\s*/, '');

  const { reaction: rawPt, ar } = splitReactionAr(body);
  const reaction = stripReactionQuestions(rawPt);

  const issues: ConvoOutputIssue[] = [];
  const scriptIssues: ScriptIssue[] = [];

  const ptIssue = checkPtScript(rawPt);
  if (ptIssue) scriptIssues.push(ptIssue);
  if (ar != null && ar.trim()) {
    const arIssue = checkArScript(ar);
    if (arIssue) scriptIssues.push(arIssue);
  } else if (/AR\s*:/i.test(body) === false) {
    // Module A historically PT-only; AR optional unless marker present without body
  }

  // If AR marker leaked into PT (split failed somehow), still reject CJK in body
  if (scriptIssues.length === 0) {
    const whole = checkPtScript(stripReactionQuestions(body));
    // body may still have AR — already split; skip
    void whole;
  }

  if (findBrazilianLeak(reaction)) issues.push('brazilian');
  if (findEnglishLeak(reaction)) issues.push('english');
  if (wordCount(reaction) > CONVO_REACTION_MAX_WORDS) {
    issues.push('length');
  }

  const { decision, regenerateReason } = decisionFor(issues, scriptIssues);
  const unknownWords = findUnknownWords(reaction, opts?.knownWords);

  return {
    candidateId,
    reaction,
    ...(ar?.trim() ? { reaction_ar: ar.trim() } : {}),
    issues,
    ...(scriptIssues.length ? { scriptIssues } : {}),
    decision,
    ...(regenerateReason ? { regenerateReason } : {}),
    unknownWords,
  };
}

/**
 * After a failed regeneration, Module A drops the reaction (09 §5.4).
 */
export function dropConvoReaction(
  parsed: ParseConvoReactionResult,
): ParseConvoReactionResult {
  return {
    ...parsed,
    reaction: '',
    decision: 'drop',
  };
}
