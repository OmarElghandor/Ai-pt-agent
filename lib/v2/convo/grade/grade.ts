import { matchAnswer } from '@/lib/v2/answers/match';
import { matchKnownNearMiss } from '@/lib/v2/answers/knownNearMiss';
import {
  normalizeAnswer,
  normalizeForCompare,
} from '@/lib/v2/answers/normalize';
import { buildConvoAcceptedForms } from './accepted';

export type ConvoGradeVerdict =
  | 'correct'
  | 'near_miss'
  | 'wrong'
  | 'unclear';

export type ConvoGradeMistake = {
  id: string;
  /** Learner text or surface that triggers this mistake. */
  trigger: string;
};

export type ConvoGradeQuestion = {
  id: string;
  item_id: string;
  /** Pre-built accepted forms; otherwise built from itemTl. */
  accepted?: string[];
  mistakes?: ConvoGradeMistake[];
};

export type ConvoMapState = {
  /** Item id the map currently expects (route step). */
  expected_item_id?: string;
};

export type ConvoItemLookup = {
  id: string;
  tl: string;
};

export type GradeConvoAnswerInput = {
  learnerText: string;
  question: ConvoGradeQuestion;
  /** Target-language surface for the expected item. */
  itemTl: string;
  mapState?: ConvoMapState;
  /** Other taught items — matching one of these is `wrong`. */
  otherItems?: ConvoItemLookup[];
};

export type GradeConvoAnswerResult = {
  verdict: ConvoGradeVerdict;
  mistakeId?: string;
  itemIds: string[];
};

function matchesTrigger(answer: string, trigger: string): boolean {
  const a = normalizeForCompare(answer);
  const t = normalizeForCompare(trigger);
  if (!a || !t) return false;
  if (a === t) return true;
  // Trigger may be a bare lemma ("esquerda") inside a longer answer.
  return a.includes(t) || t.includes(a);
}

/**
 * Grade one learner answer in code (09 §4.2 step 3).
 * No model / grader call.
 */
export function gradeConvoAnswer(
  input: GradeConvoAnswerInput,
): GradeConvoAnswerResult {
  const text = input.learnerText ?? '';
  const itemIds = [input.question.item_id];

  if (!normalizeAnswer(text)) {
    return { verdict: 'unclear', itemIds };
  }

  const accepted =
    input.question.accepted ??
    buildConvoAcceptedForms(input.itemTl);

  const match = matchAnswer(text, accepted);
  if (match.kind === 'exact' || match.kind === 'accent') {
    return { verdict: 'correct', itemIds };
  }

  // Pattern / phrase stems: learner may expand "Onde fica" → "Onde fica a farmácia?"
  const stem = normalizeForCompare(input.itemTl.replace(/[.?!,;:]+$/g, ''));
  const answerNorm = normalizeForCompare(text);
  if (
    stem.length >= 6 &&
    (answerNorm === stem ||
      answerNorm.startsWith(stem + ' ') ||
      answerNorm.includes(' ' + stem + ' ') ||
      answerNorm.endsWith(' ' + stem))
  ) {
    return { verdict: 'correct', itemIds };
  }

  const near = matchKnownNearMiss(text);
  if (near) {
    return { verdict: 'near_miss', itemIds };
  }

  for (const m of input.question.mistakes ?? []) {
    if (matchesTrigger(text, m.trigger)) {
      return { verdict: 'wrong', mistakeId: m.id, itemIds };
    }
  }

  for (const other of input.otherItems ?? []) {
    if (other.id === input.question.item_id) continue;
    const otherAccepted = buildConvoAcceptedForms(other.tl);
    const otherMatch = matchAnswer(text, otherAccepted);
    if (otherMatch.kind === 'exact' || otherMatch.kind === 'accent') {
      // Prefer a listed mistake id when the trigger matches this other item.
      const listed = (input.question.mistakes ?? []).find((m) =>
        matchesTrigger(text, m.trigger) ||
        matchesTrigger(other.tl, m.trigger) ||
        normalizeForCompare(m.trigger) === normalizeForCompare(other.id),
      );
      return {
        verdict: 'wrong',
        ...(listed ? { mistakeId: listed.id } : {}),
        itemIds: [input.question.item_id, other.id],
      };
    }
  }

  // Map shows expected direction but answer is garbage / unrelated.
  void input.mapState;

  return { verdict: 'unclear', itemIds };
}
