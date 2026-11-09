import type { ConvoItemSurface, ConvoPackData } from '@/lib/v2/convo/pack';
import type { ConvoSession } from '@/lib/v2/convo/session';
import type { ConvoTurnStreamEvent } from '@/lib/v2/convo/turn/types';
import { convoQuestionAudioKey } from '@/lib/v2/convo/turn/audioKey';
import { findPackQuestion } from '@/lib/v2/convo/turn/resolveQuestion';
import { matchPackItemQuestion } from './matchPackItem';

export type HandleLanguageQuestionResult = {
  session: ConvoSession;
  /** True when answered from pack/map without a coach model call. */
  handled: boolean;
};

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
 * Language question about a pack item / map label (09 §6): answer from the
 * item card with no model; highlight on the visual; character waits.
 */
export function handleLanguageQuestionFromPack(
  input: {
    session: ConvoSession;
    pack: ConvoPackData;
    surfaces: ConvoItemSurface[];
    learnerText: string;
    emit: (event: ConvoTurnStreamEvent) => void;
  },
): HandleLanguageQuestionResult {
  const { pack, surfaces, learnerText, emit } = input;
  const session = structuredClone(input.session);
  const match = matchPackItemQuestion(learnerText, pack, surfaces);
  if (!match) {
    return { session, handled: false };
  }

  if (match.kind === 'item') {
    emit({
      type: 'coach',
      id: `pack_q_${match.item_id}`,
      eg: match.coach_eg.endsWith('جرّب تقولها')
        ? match.coach_eg
        : `${match.coach_eg} — جرّب تقولها`,
      moment: 'language_question_pack',
    });
    emit({
      type: 'visual',
      highlight_item_id: match.item_id,
    });
    // Also show the item card inline.
    emit({
      type: 'group_advance',
      group: session.current_group,
      card_ids: [match.item_id],
      coach_intros: [],
    });
  } else {
    emit({
      type: 'coach',
      id: `map_q_${match.node_id}`,
      eg: match.coach_eg,
      moment: 'language_question_map',
    });
    emit({
      type: 'visual',
      highlight_node_id: match.node_id,
    });
  }

  reemitPending(session, pack, emit);
  session.updated_at = new Date().toISOString();
  return { session, handled: true };
}
