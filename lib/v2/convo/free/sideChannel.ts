import {
  COACH_CALL_FALLBACK_EG,
  createLiveConvoCoachCaller,
  type ConvoCoachCaller,
} from '@/lib/v2/convo/sideChannel/coachCall';
import type { ThreadFrame } from '@/lib/v2/convo/topics';
import type { ConvoTurnStreamEvent } from '@/lib/v2/convo/turn/types';
import { fitFrameFromArabic } from './frameFit';

export const FREE_COACH_TIMEOUT_MS = 6_000;

export type FreeSideKind = 'arabic_answer' | 'language_question' | 'other';

/**
 * Free-chat Arabic side channel (Batch 9 C8).
 * Character waits; thread does not advance; Arabic never enters exchanges.
 */
export async function handleFreeArabicSide(opts: {
  kind: FreeSideKind;
  learnerText: string;
  frame?: ThreadFrame | null;
  emit: (event: ConvoTurnStreamEvent) => void;
  coachCaller?: ConvoCoachCaller;
}): Promise<void> {
  const { kind, learnerText, frame, emit } = opts;

  if (kind === 'arabic_answer' || kind === 'other') {
    const fitted = fitFrameFromArabic(learnerText, frame);
    if (fitted) {
      emit({
        type: 'coach',
        id: 'free_frame_fit',
        eg: `بالبرتغالي: «${fitted}» — جرّب تقولها`,
        moment: 'arabic_answer',
      });
      return;
    }
  }

  const caller =
    opts.coachCaller ?? createLiveConvoCoachCaller(FREE_COACH_TIMEOUT_MS);
  const hints = (frame?.chips ?? []).map((tl, i) => ({
    id: `chip${i}`,
    tl,
  }));
  if (frame?.tl) hints.unshift({ id: 'frame', tl: frame.tl });

  const result = await caller({
    learnerQuestion: learnerText,
    itemHints: hints,
  });

  let eg = result.eg || COACH_CALL_FALLBACK_EG;
  if (!eg.includes('جرّب تقولها')) {
    eg = `${eg.replace(/\s+$/, '')} — جرّب تقولها`;
  }

  emit({
    type: 'coach',
    id: kind === 'language_question' ? 'free_lang_q' : 'free_ar_coach',
    eg,
    moment: kind,
  });
}
