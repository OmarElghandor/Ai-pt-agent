import { pickCoachLine } from '@/lib/v2/convo/encouragement';
import { surfaceTlFor, type ConvoItemSurface } from '@/lib/v2/convo/pack';
import type { ConvoSession } from '@/lib/v2/convo/session';
import type { ConvoTurnStreamEvent } from '@/lib/v2/convo/turn/types';
import { convoQuestionAudioKey } from '@/lib/v2/convo/turn/audioKey';
import { findPackQuestion } from '@/lib/v2/convo/turn/resolveQuestion';
import type { ConvoPackData } from '@/lib/v2/convo/pack';

export type HandleArabicAnswerInput = {
  session: ConvoSession;
  pack: ConvoPackData;
  surfaces: ConvoItemSurface[];
  emit: (event: ConvoTurnStreamEvent) => void;
};

/**
 * Answer-in-Arabic path (09 §6): coach gives the Portuguese for the pending
 * item; character waits; never counted as an error; Arabic never enters exchanges.
 */
export function handleArabicAnswer(
  input: HandleArabicAnswerInput,
): ConvoSession {
  const { pack, surfaces, emit } = input;
  const session = structuredClone(input.session);
  const pending = session.pending_question;

  const itemId = pending?.item_id ?? '';
  const itemTl = itemId ? surfaceTlFor(surfaces, itemId) : undefined;

  try {
    const picked = pickCoachLine({
      moment: 'arabic_answer',
      itemTl,
      recentIds: session.coach_recent_ids,
    });
    session.coach_recent_ids = picked.recentIds;
    emit({
      type: 'coach',
      id: picked.id,
      eg: picked.eg,
      moment: 'arabic_answer',
    });
  } catch {
    // Bank missing — still wait without grading.
    emit({
      type: 'coach',
      id: 'aa_fallback',
      eg: itemTl
        ? `بالبرتغالي بنقولها ${itemTl}، جرّب`
        : 'قولها بالبرتغالي، جرّب',
      moment: 'arabic_answer',
    });
  }

  // Re-emit the pending question so the UI keeps the same prompt.
  if (pending) {
    let tl = '';
    const meta = findPackQuestion(pack, pending.id);
    if (meta?.kind === 'choice') {
      tl =
        pack.items[pending.item_id]?.choice_questions.find(
          (q) => q.id === pending.id,
        )?.tl ?? '';
    } else if (meta?.kind === 'open') {
      tl =
        pack.items[pending.item_id]?.open_questions.find(
          (q) => q.id === pending.id,
        )?.tl ?? '';
    } else if (meta?.kind === 'recap') {
      tl = pack.recap.questions.find((q) => q.id === pending.id)?.tl ?? '';
    }
    if (tl) {
      emit({
        type: 'question',
        id: pending.id,
        tl,
        kind: pending.kind,
        item_id: pending.item_id,
        audio_key: convoQuestionAudioKey(pack.pack_id, pending.id),
      });
    }
  }

  session.updated_at = new Date().toISOString();
  return session;
}
