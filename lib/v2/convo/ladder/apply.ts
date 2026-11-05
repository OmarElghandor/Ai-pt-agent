import type { ConvoPackData } from '@/lib/v2/convo/pack';
import type { GradeConvoAnswerResult } from '@/lib/v2/convo/grade';
import type {
  ConvoPendingQuestion,
  ConvoRung,
  ConvoSession,
} from '@/lib/v2/convo/session';
import type {
  ApplyConvoGradeResult,
  CoachMoment,
  ConvoEventFacts,
  ConvoGroupAdvance,
} from './types';

const PRODUCED: ReadonlySet<ConvoRung> = new Set(['said', 'assisted']);
const GROUP_DONE: ReadonlySet<ConvoRung> = new Set([
  'understood',
  'said',
  'assisted',
]);

function cloneSession(session: ConvoSession): ConvoSession {
  return {
    ...session,
    rungs: { ...session.rungs },
    help_ladder: { ...session.help_ladder },
    candidate_history: [...session.candidate_history],
    last_exchanges: session.last_exchanges.map((e) => ({ ...e })),
    facts: [...session.facts],
    pending_frame: session.pending_frame
      ? {
          tl: session.pending_frame.tl,
          eg: session.pending_frame.eg,
          chips: [...session.pending_frame.chips],
        }
      : null,
    suggested_words: [...session.suggested_words],
    struggled: { ...session.struggled },
    said_once: { ...session.said_once },
    coach_recent_ids: [...session.coach_recent_ids],
    recap_done_ids: [...session.recap_done_ids],
    survival_used: session.survival_used ?? 0,
  };
}

function groupItemIds(pack: ConvoPackData, groupIndex1: number): string[] {
  return pack.groups[groupIndex1 - 1]?.item_ids ?? [];
}

function isGroupComplete(
  pack: ConvoPackData,
  groupIndex1: number,
  rungs: Record<string, ConvoRung>,
): boolean {
  const ids = groupItemIds(pack, groupIndex1);
  if (ids.length === 0) return false;
  return ids.every((id) => GROUP_DONE.has(rungs[id] ?? 'taught'));
}

function allItemsProduced(
  pack: ConvoPackData,
  rungs: Record<string, ConvoRung>,
): boolean {
  const ids = pack.groups.flatMap((g) => g.item_ids);
  if (ids.length === 0) return false;
  return ids.every((id) => PRODUCED.has(rungs[id] ?? 'taught'));
}

function findMistake(
  pack: ConvoPackData,
  itemId: string,
  mistakeId: string | undefined,
): { id: string; consequence_tl: string } | undefined {
  if (!mistakeId) return undefined;
  const m = pack.items[itemId]?.common_mistakes.find((x) => x.id === mistakeId);
  return m ? { id: m.id, consequence_tl: m.consequence_tl } : undefined;
}

function buildGroupAdvance(
  pack: ConvoPackData,
  group: number,
  rungs?: Record<string, ConvoRung>,
): ConvoGroupAdvance {
  const rawIds = groupItemIds(pack, group);
  // Review seed: only show cards for items still at taught (T6.3).
  const card_ids = rungs
    ? rawIds.filter((id) => (rungs[id] ?? 'taught') === 'taught')
    : rawIds;
  return {
    group,
    card_ids,
    coach_intros: card_ids.map((item_id) => ({
      item_id,
      coach_intro_eg: pack.items[item_id]?.coach_intro_eg ?? '',
    })),
  };
}

/**
 * Apply a graded answer to the session (09 §3, §4.2 step 4).
 * Pure: returns a new session; no DB writes.
 */
export function applyConvoGrade(input: {
  session: ConvoSession;
  pack: ConvoPackData;
  grade: GradeConvoAnswerResult;
  pending: NonNullable<ConvoPendingQuestion>;
}): ApplyConvoGradeResult {
  const { pack, grade, pending } = input;
  const next = cloneSession(input.session);
  next.updated_at = new Date().toISOString();
  const moments: CoachMoment[] = [];
  const itemId = pending.item_id;
  let group_advance: ConvoGroupAdvance | null = null;

  const mistake = findMistake(pack, itemId, grade.mistakeId);
  const event: ConvoEventFacts = {
    verdict: grade.verdict,
    item_id: itemId,
    question_id: pending.id,
    question_kind: pending.kind,
    phase: next.phase,
  };
  if (grade.verdict === 'near_miss') {
    event.near_miss = true;
  }

  // --- unclear: no rung / help change ---
  if (grade.verdict === 'unclear') {
    next.correct_streak = 0;
    moments.push('unclear');
    return { session: next, moments, event, group_advance: null };
  }

  // --- wrong: escalate help ladder ---
  if (grade.verdict === 'wrong') {
    next.correct_streak = 0;
    next.struggled[itemId] = true;

    const qid =
      pending.kind === 'help'
        ? (input.session.help_ladder.question_id ?? pending.id)
        : pending.id;
    const sameQ = input.session.help_ladder.question_id === qid;
    const prevStep = sameQ ? input.session.help_ladder.step : 0;
    const nextStep = Math.min(4, prevStep === 0 ? 1 : prevStep + 1) as
      | 1
      | 2
      | 3
      | 4;
    const attempts =
      (sameQ ? input.session.help_ladder.attempts : 0) + 1;

    next.help_ladder = {
      question_id: qid,
      step: nextStep,
      attempts,
    };
    next.pending_question = {
      id: qid,
      kind: 'help',
      item_id: itemId,
    };

    const missMoment = `miss_${nextStep}` as CoachMoment;
    moments.push(missMoment);

    event.help_step = nextStep;
    event.attempts = attempts;
    if (mistake) {
      event.mistake_id = mistake.id;
      event.consequence_tl = mistake.consequence_tl;
    } else if (grade.mistakeId) {
      event.mistake_id = grade.mistakeId;
    }

    return { session: next, moments, event, group_advance: null };
  }

  // --- correct / near_miss ---
  const helpBefore = input.session.help_ladder;
  const afterMisses =
    helpBefore.question_id === pending.id ||
    helpBefore.question_id ===
      (pending.kind === 'help' ? pending.id : null)
      ? helpBefore.attempts
      : helpBefore.step > 0
        ? helpBefore.attempts
        : 0;
  const wasOnHelp = helpBefore.step > 0;
  const struggled = !!input.session.struggled[itemId] || wasOnHelp;

  next.help_ladder = { question_id: null, step: 0, attempts: 0 };
  next.correct_streak = input.session.correct_streak + 1;
  next.pending_question = null;

  event.after_misses = afterMisses;
  if (afterMisses > 0) event.help_step = helpBefore.step;

  if (pending.kind === 'recap') {
    if (!next.recap_done_ids.includes(pending.id)) {
      next.recap_done_ids = [...next.recap_done_ids, pending.id];
    }
    const allRecapDone = pack.recap.questions.every((q) =>
      next.recap_done_ids.includes(q.id),
    );
    if (allRecapDone) {
      next.phase = 'closing';
      next.status = 'done';
      moments.push('conversation_finished');
      event.phase = 'closing';
    } else {
      event.phase = 'recap';
    }
  } else if (pending.kind === 'choice') {
    const cur = next.rungs[itemId] ?? 'taught';
    if (cur === 'taught' || cur === 'heard') {
      next.rungs[itemId] = 'understood';
    }
  } else if (pending.kind === 'open' || pending.kind === 'help') {
    if (struggled) {
      next.rungs[itemId] = 'assisted';
      moments.push('success_after_struggle');
    } else {
      next.rungs[itemId] = 'said';
      event.first_without_help = true;
      if (!input.session.said_once[itemId]) {
        next.said_once[itemId] = true;
        moments.push('first_said');
      }
    }
  }

  if (next.correct_streak > 0 && next.correct_streak % 3 === 0) {
    moments.push('streak_3');
  }

  // Group gate: every item in current group at 👆+
  if (
    next.phase === 'teaching' &&
    isGroupComplete(pack, input.session.current_group, next.rungs)
  ) {
    moments.push('group_done');
    if (input.session.current_group < pack.groups.length) {
      next.current_group = input.session.current_group + 1;
      group_advance = buildGroupAdvance(pack, next.current_group, next.rungs);
    }
  }

  // All items 🗣 or assisted → recap
  if (
    next.phase === 'teaching' &&
    allItemsProduced(pack, next.rungs)
  ) {
    next.phase = 'recap';
    event.phase = 'recap';
  }

  return { session: next, moments, event, group_advance };
}
