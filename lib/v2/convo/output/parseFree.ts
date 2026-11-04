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

/** Module C: at most two short sentences (~16 words). */
export const FREE_CONVO_MAX_WORDS = 16;

export function endsWithQuestionOrInvitation(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/\?\s*$/u.test(t)) return true;
  // Soft invitations without ?
  return /\b(diga-me|conta-me|e tu|e você)\b/iu.test(t);
}

function decisionFor(
  issues: ConvoOutputIssue[],
): Pick<ParseConvoReactionResult, 'decision' | 'regenerateReason'> {
  if (issues.length === 0) return { decision: 'ok' };
  const reasons: string[] = [];
  if (issues.includes('brazilian')) {
    reasons.push('you used a Brazilian form; say it in European Portuguese');
  }
  if (issues.includes('english')) {
    reasons.push('you used English; reply in Portuguese only');
  }
  if (issues.includes('length')) {
    reasons.push(
      `the reply is longer than ${FREE_CONVO_MAX_WORDS} words; shorten it`,
    );
  }
  return {
    decision: 'regenerate',
    regenerateReason: reasons.join('; '),
  };
}

/**
 * Parse Module C free-chat output (09 §5.3–5.4).
 * Keeps trailing questions. No candidate tag required.
 * On repeated check failure → decision drop (caller appends next angle).
 */
export function parseFreeConvoReaction(
  text: string,
  opts?: { knownWords?: string[] },
): ParseConvoReactionResult {
  // Strip accidental leading [id] tags if the model adds them
  const reaction = text.replace(/^\s*\[[^\]]*\]\s*/, '').trim();

  const issues: ConvoOutputIssue[] = [];
  if (findBrazilianLeak(reaction)) issues.push('brazilian');
  if (findEnglishLeak(reaction)) issues.push('english');
  if (wordCount(reaction) > FREE_CONVO_MAX_WORDS) issues.push('length');

  const { decision, regenerateReason } = decisionFor(issues);
  const unknownWords = findUnknownWords(reaction, opts?.knownWords);

  return {
    candidateId: '',
    reaction,
    issues,
    decision,
    ...(regenerateReason ? { regenerateReason } : {}),
    unknownWords,
  };
}

export function dropFreeConvoReaction(
  parsed: ParseConvoReactionResult,
): ParseConvoReactionResult {
  return {
    ...parsed,
    reaction: '',
    decision: 'drop' as ConvoParseDecision,
  };
}
