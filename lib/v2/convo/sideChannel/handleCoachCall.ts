import { surfaceTlFor, type ConvoItemSurface, type ConvoPackData } from '@/lib/v2/convo/pack';
import type { ConvoSession } from '@/lib/v2/convo/session';
import type { ConvoTurnStreamEvent } from '@/lib/v2/convo/turn/types';
import { convoQuestionAudioKey } from '@/lib/v2/convo/turn/audioKey';
import { findPackQuestion } from '@/lib/v2/convo/turn/resolveQuestion';
import {
  createLiveConvoCoachCaller,
  type ConvoCoachCaller,
} from './coachCall';

function reemitPending(
  session: ConvoSession,
  pack: ConvoPackData,
  emit: (event: ConvoTurnStreamEvent) => void,
): void {
  const pending = session.pending_question;
  if (!pending) return;
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
  if (!tl) return;
  emit({
    type: 'question',
    id: pending.id,
    tl,
    kind: pending.kind,
    item_id: pending.item_id,
    audio_key: convoQuestionAudioKey(pack.pack_id, pending.id),
  });
}

/**
 * Unmatched language question → small coach call (09 §6).
 * Character waits; Arabic never enters exchanges; no character model.
 */
export async function handleLanguageQuestionCoachCall(input: {
  session: ConvoSession;
  pack: ConvoPackData;
  surfaces: ConvoItemSurface[];
  learnerText: string;
  emit: (event: ConvoTurnStreamEvent) => void;
  coachCaller?: ConvoCoachCaller;
}): Promise<ConvoSession> {
  const { pack, surfaces, learnerText, emit } = input;
  const session = structuredClone(input.session);
  const caller = input.coachCaller ?? createLiveConvoCoachCaller();

  const itemHints = Object.keys(pack.items).map((id) => ({
    id,
    tl: surfaceTlFor(surfaces, id),
  }));

  const result = await caller({
    learnerQuestion: learnerText,
    itemHints,
  });

  emit({
    type: 'coach',
    id:
      result.timedOut || result.error
        ? 'coach_call_fallback'
        : 'coach_call',
    eg: result.eg,
    moment: 'language_question_coach',
  });

  reemitPending(session, pack, emit);
  session.updated_at = new Date().toISOString();
  return session;
}
