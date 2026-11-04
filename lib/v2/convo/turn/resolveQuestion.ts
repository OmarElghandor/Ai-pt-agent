import type { ConvoPackData } from '@/lib/v2/convo/pack';
import type { ConvoSelectCandidate, ConvoSelectHelp } from '@/lib/v2/convo/select';
import type { ResolvedConvoQuestion } from './types';

/** Look up a candidate question in the pack by id. */
export function resolveCandidateQuestion(
  pack: ConvoPackData,
  candidate: ConvoSelectCandidate,
): ResolvedConvoQuestion {
  if (candidate.qkind === 'recap') {
    const q = pack.recap.questions.find((x) => x.id === candidate.id);
    return {
      id: candidate.id,
      tl: q?.tl ?? candidate.tl,
      kind: 'recap',
      item_id: candidate.item_id,
      candidate,
    };
  }

  const bank = pack.items[candidate.item_id];
  if (candidate.qkind === 'choice') {
    const q = bank?.choice_questions.find((x) => x.id === candidate.id);
    return {
      id: candidate.id,
      tl: q?.tl ?? candidate.tl,
      kind: 'choice',
      item_id: candidate.item_id,
      option_ids: q?.option_ids,
      candidate,
    };
  }

  const q = bank?.open_questions.find((x) => x.id === candidate.id);
  return {
    id: candidate.id,
    tl: q?.tl ?? candidate.tl,
    kind: 'open',
    item_id: candidate.item_id,
    candidate,
  };
}

/** Build a synthetic candidate + resolved question from a help-ladder step. */
export function resolveHelpQuestion(
  help: ConvoSelectHelp,
): ResolvedConvoQuestion {
  const tl = help.tl ?? help.choice_tl ?? '';
  const candidate: ConvoSelectCandidate = {
    id: help.question_id,
    tl: tl || `(help step ${help.step})`,
    item_id: help.item_id,
    qkind: 'open',
  };

  return {
    id: help.question_id,
    tl,
    kind: 'help',
    item_id: help.item_id,
    option_ids: help.option_ids,
    candidate,
  };
}

/** Find any pack question by id (for grading the pending question). */
export function findPackQuestion(
  pack: ConvoPackData,
  questionId: string,
): {
  item_id: string;
  kind: 'choice' | 'open' | 'recap';
  option_ids?: string[];
  correct_id?: string;
  mistakes?: Array<{ id: string; trigger: string }>;
} | null {
  for (const [itemId, bank] of Object.entries(pack.items)) {
    const choice = bank.choice_questions.find((q) => q.id === questionId);
    if (choice) {
      return {
        item_id: itemId,
        kind: 'choice',
        option_ids: choice.option_ids,
        correct_id: choice.correct_id,
        mistakes: bank.common_mistakes.map((m) => ({
          id: m.id,
          trigger: m.trigger,
        })),
      };
    }
    const open = bank.open_questions.find((q) => q.id === questionId);
    if (open) {
      return {
        item_id: itemId,
        kind: 'open',
        mistakes: bank.common_mistakes.map((m) => ({
          id: m.id,
          trigger: m.trigger,
        })),
      };
    }
  }
  const recap = pack.recap.questions.find((q) => q.id === questionId);
  if (recap) {
    return { item_id: recap.item_id, kind: 'recap' };
  }
  return null;
}
