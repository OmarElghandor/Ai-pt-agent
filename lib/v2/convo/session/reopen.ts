import type { ConvoPackData } from '@/lib/v2/convo/pack';
import { pickCoachLine } from '@/lib/v2/convo/encouragement';
import { convoQuestionAudioKey } from '@/lib/v2/convo/turn/audioKey';
import { findPackQuestion } from '@/lib/v2/convo/turn/resolveQuestion';
import type {
  ConvoOpeningBubbles,
  ConvoPendingQuestion,
  ConvoSession,
  ConvoReopeningPayload,
} from './types';

/** Fixed reopening templates (09 §8 / T4.1). No model call. */
const REOPEN_TEMPLATES = [
  'Olá outra vez! Continuamos: {question}',
  'Bem-vindo de volta. Então… {question}',
  'Ainda estamos aqui. {question}',
];

export function pendingQuestionTl(
  pack: ConvoPackData,
  pending: NonNullable<ConvoPendingQuestion>,
): string {
  const meta = findPackQuestion(pack, pending.id);
  if (meta?.kind === 'choice') {
    return (
      pack.items[pending.item_id]?.choice_questions.find(
        (q) => q.id === pending.id,
      )?.tl ?? ''
    );
  }
  if (meta?.kind === 'open') {
    return (
      pack.items[pending.item_id]?.open_questions.find(
        (q) => q.id === pending.id,
      )?.tl ?? ''
    );
  }
  if (meta?.kind === 'recap') {
    return pack.recap.questions.find((q) => q.id === pending.id)?.tl ?? '';
  }
  // Help ladder: use last character exchange or empty
  return '';
}

function pickTemplate(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % REOPEN_TEMPLATES.length;
  return REOPEN_TEMPLATES[idx] ?? REOPEN_TEMPLATES[0];
}

/**
 * Build reopening bubbles from a template + the pending question (no model).
 * Updates coach_recent_ids when a returned_after_break line is picked.
 */
export function buildReopening(
  session: ConvoSession,
  pack: ConvoPackData,
): {
  opening: ConvoOpeningBubbles;
  reopening: ConvoReopeningPayload;
  session: ConvoSession;
} {
  const pending = session.pending_question;
  const questionTl = pending ? pendingQuestionTl(pack, pending) : '';
  const template = pickTemplate(session.id + (pending?.id ?? ''));
  const characterTl = questionTl
    ? template.replace('{question}', questionTl)
    : 'Olá outra vez! Continuamos de onde parámos.';

  let coachEg: string | undefined;
  let coachId: string | undefined;
  const next = structuredClone(session);
  try {
    const picked = pickCoachLine({
      moment: 'returned_after_break',
      recentIds: next.coach_recent_ids,
    });
    next.coach_recent_ids = picked.recentIds;
    coachEg = picked.eg;
    coachId = picked.id;
  } catch {
    // optional
  }

  const opening: ConvoOpeningBubbles = {
    character: { tl: characterTl },
    coach_intros: coachEg
      ? [{ item_id: pending?.item_id ?? '', coach_intro_eg: coachEg }]
      : [],
    card_ids: [],
  };

  const reopening: ConvoReopeningPayload = {
    character_tl: characterTl,
    pending_question: pending,
    pending_tl: questionTl || null,
    pending_audio_key:
      pending != null
        ? convoQuestionAudioKey(pack.pack_id, pending.id)
        : null,
    ...(coachEg && coachId
      ? { coach: { id: coachId, eg: coachEg } }
      : {}),
  };

  return { opening, reopening, session: next };
}
