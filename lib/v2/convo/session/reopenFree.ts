import { pickCoachLine } from '@/lib/v2/convo/encouragement';
import type { FreeTopic } from '@/lib/v2/convo/topics';
import type {
  ConvoOpeningBubbles,
  ConvoReopeningPayload,
  ConvoSession,
} from './types';

const FREE_REOPEN_TEMPLATES = [
  'Olá outra vez! Estávamos a falar de {topic}… {question}',
  'Bem-vindo de volta. Falávamos de {topic}. {question}',
  'Ainda por aqui! Sobre {topic}: {question}',
];

function pickTemplate(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % FREE_REOPEN_TEMPLATES.length;
  return FREE_REOPEN_TEMPLATES[idx] ?? FREE_REOPEN_TEMPLATES[0]!;
}

/**
 * Free-chat reopening from template + pending line (Batch 9).
 * No model call.
 */
export function buildFreeReopening(
  session: ConvoSession,
  topic: FreeTopic,
  pendingTl: string,
): {
  opening: ConvoOpeningBubbles;
  reopening: ConvoReopeningPayload;
  session: ConvoSession;
} {
  const pending = session.pending_question;
  const questionTl = pendingTl.trim();
  const template = pickTemplate(session.id + (pending?.id ?? ''));
  const characterTl = questionTl
    ? template
        .replace('{topic}', topic.title_tl)
        .replace('{question}', questionTl)
    : `Olá outra vez! Continuamos a falar de ${topic.title_tl}.`;

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
    pending_audio_key: pending ? `free:${topic.id}:${pending.id}` : null,
    ...(coachEg && coachId ? { coach: { id: coachId, eg: coachEg } } : {}),
  };

  return { opening, reopening, session: next };
}
