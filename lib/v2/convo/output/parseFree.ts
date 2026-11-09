import {
  findBrazilianLeak,
  findEnglishLeak,
  findUnknownWords,
  wordCount,
  type ConvoOutputIssue,
} from './checks';
import type {
  ConvoParseDecision,
  ParseConvoReactionResult,
} from './parse';
import {
  checkArScript,
  checkPtScript,
  scriptIssueReason,
  splitReactionAr,
  type ScriptIssue,
} from './scriptGuard';

/** Batch 9: default reaction cap; 24 when the learner asked a question. */
export const FREE_CONVO_MAX_WORDS = 12;
export const FREE_CONVO_MAX_WORDS_WHEN_ASKED = 24;

const FORMAL_RE = /\b(você|a sua|o seu|os seus|as suas)\b/i;

export type FreeParseExtraIssue =
  | 'missing_ar'
  | 'question'
  | 'formal'
  | 'not_arabic'
  | ScriptIssue;

export type ParseFreeConvoResult = ParseConvoReactionResult & {
  reaction_ar: string;
  extraIssues: FreeParseExtraIssue[];
};

/** Split raw model text on AR: anywhere (line or inline). */
export function splitFreeReactionAr(text: string): {
  reaction: string;
  ar: string | null;
} {
  return splitReactionAr(text);
}

/** Remove any sentence that ends with ?. */
export function stripQuestionSentences(text: string): string {
  const parts = text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const kept = parts.filter((s) => !/\?\s*$/.test(s) && !s.includes('?'));
  return kept.join(' ').trim();
}

export function endsWithQuestionOrInvitation(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/\?\s*$/u.test(t)) return true;
  return /\b(diga-me|conta-me|e tu|e você)\b/iu.test(t);
}

function decisionFor(
  issues: ConvoOutputIssue[],
  extra: FreeParseExtraIssue[],
  maxWords: number,
): Pick<ParseConvoReactionResult, 'decision' | 'regenerateReason'> {
  if (issues.length === 0 && extra.length === 0) return { decision: 'ok' };
  const reasons: string[] = [];
  if (issues.includes('brazilian')) {
    reasons.push('you used a Brazilian form; say it in European Portuguese');
  }
  if (issues.includes('english')) {
    reasons.push('you used English; reply in Portuguese only');
  }
  if (issues.includes('length')) {
    reasons.push(`the reply is longer than ${maxWords} words; shorten it`);
  }
  if (extra.includes('missing_ar')) {
    reasons.push('add a second line starting with AR: and the Arabic translation');
  }
  if (extra.includes('not_arabic') || extra.includes('ar_not_arabic')) {
    reasons.push(scriptIssueReason('ar_not_arabic'));
  }
  for (const issue of [
    'cjk',
    'cyrillic',
    'forbidden_script',
    'pt_not_latin',
  ] as const) {
    if (extra.includes(issue)) reasons.push(scriptIssueReason(issue));
  }
  if (extra.includes('question')) {
    reasons.push('do not ask a question; the app adds the next line');
  }
  if (extra.includes('formal')) {
    reasons.push('use tu forms only (never você / a sua / o seu)');
  }
  return {
    decision: 'regenerate',
    regenerateReason: reasons.join('; '),
  };
}

/**
 * Parse Batch 9 free-chat model output: reaction + AR: line.
 */
export function parseFreeConvoReaction(
  text: string,
  opts?: { knownWords?: string[]; learnerAsked?: boolean },
): ParseFreeConvoResult {
  const maxWords = opts?.learnerAsked
    ? FREE_CONVO_MAX_WORDS_WHEN_ASKED
    : FREE_CONVO_MAX_WORDS;

  const { reaction: rawReaction, ar } = splitFreeReactionAr(text);
  let reaction = stripQuestionSentences(rawReaction);

  const issues: ConvoOutputIssue[] = [];
  const extraIssues: FreeParseExtraIssue[] = [];

  if (ar == null || !ar.trim()) {
    extraIssues.push('missing_ar');
  } else {
    const arIssue = checkArScript(ar);
    if (arIssue) {
      extraIssues.push(arIssue === 'ar_not_arabic' ? 'not_arabic' : arIssue);
    }
  }
  const ptIssue = checkPtScript(rawReaction);
  if (ptIssue) extraIssues.push(ptIssue);

  if (/\?/.test(rawReaction)) {
    // Stripped for display, but still regenerate so the model learns.
    extraIssues.push('question');
  }
  if (FORMAL_RE.test(reaction) || FORMAL_RE.test(rawReaction)) {
    extraIssues.push('formal');
  }
  if (findBrazilianLeak(reaction) || findBrazilianLeak(rawReaction)) {
    issues.push('brazilian');
  }
  if (findEnglishLeak(reaction) || findEnglishLeak(rawReaction)) {
    issues.push('english');
  }
  if (wordCount(reaction) > maxWords) issues.push('length');

  const { decision, regenerateReason } = decisionFor(
    issues,
    extraIssues,
    maxWords,
  );
  const unknownWords = findUnknownWords(reaction, opts?.knownWords);

  return {
    candidateId: '',
    reaction,
    reaction_ar: ar?.trim() ?? '',
    issues,
    extraIssues,
    decision,
    ...(regenerateReason ? { regenerateReason } : {}),
    unknownWords,
  };
}

export function dropFreeConvoReaction(
  parsed: ParseFreeConvoResult | ParseConvoReactionResult,
): ParseFreeConvoResult {
  const extra =
    'extraIssues' in parsed ? parsed.extraIssues : ([] as FreeParseExtraIssue[]);
  const ar =
    'reaction_ar' in parsed ? (parsed as ParseFreeConvoResult).reaction_ar : '';
  return {
    ...parsed,
    reaction: '',
    reaction_ar: ar,
    extraIssues: extra,
    decision: 'drop' as ConvoParseDecision,
  };
}

/**
 * Hide everything from the AR: marker onward while streaming (G1).
 * Holds incomplete leading labels and trailing partial "AR" so fragments
 * never reach the client. Cuts on AR: anywhere (inline or new line).
 */
export function visibleFreeStreamText(accumulated: string): string {
  let s = accumulated.replace(/\r\n/g, '\n');

  // Complete AR: marker anywhere
  const cut = s.search(/\s*AR\s*:/i);
  if (cut >= 0) {
    if (cut === 0 || /^\s*$/.test(s.slice(0, cut))) return '';
    s = s.slice(0, cut);
  } else {
    // Trailing partial AR label (newline or inline)
    const partial = s.match(/(?:\n|\s)(A|AR)\s*:?\s*$/i);
    if (partial && partial.index != null) {
      s = s.slice(0, partial.index);
    } else if (/\n\s*$/.test(s)) {
      s = s.replace(/\n\s*$/, '');
    }
  }

  const trimmedStart = s.replace(/^\s+/, '');
  if (!trimmedStart) return '';

  if (/^AR\s*:/i.test(trimmedStart)) return '';
  if (/^A$/i.test(trimmedStart) || /^AR$/i.test(trimmedStart)) {
    if (/^\s*A(?:R)?\s*:?\s*$/i.test(accumulated)) return '';
  }

  return trimmedStart.replace(/\s*AR\s*:[\s\S]*$/i, '');
}
