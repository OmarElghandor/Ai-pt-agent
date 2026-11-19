import { wordCount } from '@/lib/v2/convo/output/checks';
import { checkPtScript } from '@/lib/v2/convo/output/scriptGuard';
import {
  checkReplyLevel,
  loadCommonWords,
  tokenizeContentWords,
} from '@/lib/v2/convo/guard/levelGuard';
import { reactionInventedNumbers } from './numbers';
import { stripRepeatedOpener } from './opener';
import {
  isWeakWordOrPhrase,
  normalizeSceneText,
  sceneKeywordMatchesToken,
} from './weak';

export type SceneReactionParse = {
  pt: string;
  ar: string;
  /** Raw GOAL: line (id | side | none …). */
  goalLine: string | null;
};

export type SceneReactionGuard =
  | 'accepted'
  | 'dropped_empty'
  | 'dropped_script'
  | 'dropped_length'
  | 'dropped_question'
  | 'dropped_echo'
  | 'dropped_numbers'
  | 'dropped_level'
  | 'dropped_new_content'
  | 'ask_only';

/** Parse PT: / AR: / GOAL: (also tolerates bare first line + AR: + GOALS:). */
export function parseSceneModelOutput(text: string): SceneReactionParse {
  let s = text.replace(/\r\n/g, '\n').trim();
  let goalLine: string | null = null;
  const goalMatch = s.match(/\n?\s*GOALS?\s*:\s*([^\n]*)/i);
  if (goalMatch && goalMatch.index != null) {
    goalLine = (goalMatch[1] ?? '').trim();
    s = s.slice(0, goalMatch.index).trimEnd();
  }
  let ar = '';
  const arMatch = s.match(/\n?\s*AR\s*:\s*([\s\S]*)$/i);
  let pt = s;
  if (arMatch && arMatch.index != null) {
    ar = (arMatch[1] ?? '').trim();
    pt = s.slice(0, arMatch.index).trim();
  }
  pt = pt.replace(/^PT\s*:\s*/i, '').trim();
  return { pt, ar, goalLine };
}

function endsWithQuestion(pt: string): boolean {
  const core = pt
    .trim()
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s]+$/u, '')
    .trim();
  return /\?\s*$/.test(core);
}

/** 4+ consecutive words of the learner’s message appear in the reaction. */
export function reactionEchoesLearner(
  reactionPt: string,
  learnerText: string,
): boolean {
  const rNorm = normalizeSceneText(reactionPt);
  const r = rNorm.split(/\s+/).filter(Boolean);
  const l = normalizeSceneText(learnerText).split(/\s+/).filter(Boolean);
  if (l.length >= 4 && r.length >= 4) {
    for (let i = 0; i <= l.length - 4; i++) {
      const slice = l.slice(i, i + 4).join(' ');
      if (rNorm.includes(slice)) return true;
    }
  }
  // Long restatement echo (T12): long reaction that reuses the learner’s content.
  if (r.length >= 6 && l.length >= 2) {
    const rSet = new Set(r);
    const hits = l.filter((w) => w.length > 1 && rSet.has(w));
    if (hits.length >= 2 && r.length >= 8) return true;
    if (hits.length >= 3) return true;
  }
  return false;
}

/**
 * §8.3: drop when a content word (not common) appears in none of:
 * learner message (typo-tolerant), current/matched examples, facts, last line.
 */
export function reactionHasNewContentWords(opts: {
  reactionPt: string;
  learnerText: string;
  allowTexts: readonly string[];
}): boolean {
  const common = loadCommonWords();
  const allowed = new Set<string>();
  for (const src of [opts.learnerText, ...opts.allowTexts]) {
    for (const tok of tokenizeContentWords(src)) {
      if (tok) allowed.add(tok);
    }
  }
  const allowedList = [...allowed];
  for (const tok of tokenizeContentWords(opts.reactionPt)) {
    if (common.has(tok)) continue;
    // Weak fillers (claro, ok…) are not new scene content (§8.3 nouns/adj/verbs).
    if (isWeakWordOrPhrase(tok)) continue;
    if (allowed.has(tok)) continue;
    if (allowedList.some((a) => sceneKeywordMatchesToken(a, tok))) continue;
    return true;
  }
  return false;
}

export function guardSceneReaction(opts: {
  pt: string;
  learnerText: string;
  level: number;
  extraAllowed: readonly string[];
  numberAllowed: readonly string[];
  prevCharacterTl?: string | null;
  /** §8.3 allowlist texts: examples + facts + last character line. */
  newContentAllowTexts?: readonly string[];
}): { pt: string; guard: SceneReactionGuard } {
  let pt = opts.pt.trim();
  if (!pt) return { pt: '', guard: 'dropped_empty' };

  const script = checkPtScript(pt);
  if (script) return { pt: '', guard: 'dropped_script' };

  if (wordCount(pt) > 12) return { pt: '', guard: 'dropped_length' };

  if (endsWithQuestion(pt)) return { pt: '', guard: 'dropped_question' };

  if (reactionEchoesLearner(pt, opts.learnerText)) {
    return { pt: '', guard: 'dropped_echo' };
  }

  if (reactionInventedNumbers(pt, [...opts.numberAllowed])) {
    return { pt: '', guard: 'dropped_numbers' };
  }

  if (
    reactionHasNewContentWords({
      reactionPt: pt,
      learnerText: opts.learnerText,
      allowTexts: [
        ...(opts.newContentAllowTexts ?? []),
        opts.prevCharacterTl ?? '',
      ],
    })
  ) {
    return { pt: '', guard: 'dropped_new_content' };
  }

  const level = checkReplyLevel({
    text: pt,
    level: opts.level,
    extraAllowed: opts.extraAllowed,
  });
  if (!level.ok) return { pt: '', guard: 'dropped_level' };

  pt = stripRepeatedOpener(opts.prevCharacterTl, pt);
  if (!pt) return { pt: '', guard: 'ask_only' };

  return { pt, guard: 'accepted' };
}
