import type { ConvoPackData } from '@/lib/v2/convo/pack';
import { convoQuestionAudioKey } from '@/lib/v2/convo/turn/audioKey';
import { findPackQuestion } from '@/lib/v2/convo/turn/resolveQuestion';
import type {
  ConvoOpeningBubbles,
  ConvoPendingQuestion,
  ConvoSession,
  ConvoReopeningPayload,
} from './types';

/** Fixed reopening templates (legacy packs without `resume`). */
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
  // Help ladder: prefer step-1 re-ask when available
  if (pending.kind === 'help') {
    const bank = pack.items[pending.item_id];
    const open = bank?.open_questions.find((q) => q.id === pending.id)
      ?? bank?.open_questions[0];
    return open?.help_ladder?.step1_reask_tl ?? open?.tl ?? '';
  }
  return '';
}

function pendingQuestionAr(
  pack: ConvoPackData,
  pending: NonNullable<ConvoPendingQuestion>,
): string | undefined {
  const bank = pack.items[pending.item_id];
  if (!bank) return undefined;
  const choice = bank.choice_questions.find((q) => q.id === pending.id);
  if (choice?.ar) return choice.ar;
  const open = bank.open_questions.find((q) => q.id === pending.id)
    ?? (pending.kind === 'help' ? bank.open_questions[0] : undefined);
  if (pending.kind === 'help' && open?.help_ladder?.step1_reask_ar) {
    return open.help_ladder.step1_reask_ar;
  }
  return open?.ar;
}

function pendingMapNode(
  pack: ConvoPackData,
  pending: NonNullable<ConvoPendingQuestion>,
): string | undefined {
  const meta = findPackQuestion(pack, pending.id);
  return meta?.map_node;
}

function pickTemplate(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % REOPEN_TEMPLATES.length;
  return REOPEN_TEMPLATES[idx] ?? REOPEN_TEMPLATES[0]!;
}

/**
 * Build one reopening bubble: pack.resume + pending question (M7).
 * No returned_after_break coach note.
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
  const questionAr = pending ? pendingQuestionAr(pack, pending) : undefined;
  const resume = pack.resume;

  let characterTl: string;
  let characterAr: string | undefined;
  if (resume?.tl) {
    characterTl = questionTl
      ? `${resume.tl.trim()} ${questionTl.trim()}`.trim()
      : resume.tl.trim();
    const arParts = [resume.ar?.trim(), questionAr?.trim()].filter(Boolean);
    if (arParts.length) characterAr = arParts.join(' ');
  } else {
    const template = pickTemplate(session.id + (pending?.id ?? ''));
    characterTl = questionTl
      ? template.replace('{question}', questionTl)
      : 'Olá outra vez! Continuamos de onde parámos.';
    characterAr = questionAr;
  }

  const next = structuredClone(session);
  // M7: no returned_after_break coach.

  const opening: ConvoOpeningBubbles = {
    character: {
      tl: characterTl,
      ...(characterAr ? { ar: characterAr } : {}),
      ...(resume?.say ? { say: resume.say } : {}),
    },
    coach_intros: [],
    card_ids: [],
  };

  const reopening: ConvoReopeningPayload = {
    character_tl: characterTl,
    ...(characterAr ? { character_ar: characterAr } : {}),
    pending_question: pending,
    pending_tl: questionTl || null,
    pending_audio_key:
      pending != null
        ? convoQuestionAudioKey(pack.pack_id, pending.id)
        : null,
    ...(pending ? { map_node: pendingMapNode(pack, pending) } : {}),
  };

  return { opening, reopening, session: next };
}
