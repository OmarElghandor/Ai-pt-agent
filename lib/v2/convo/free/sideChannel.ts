import {
  COACH_CALL_FALLBACK_EG,
  createLiveConvoCoachCaller,
  type ConvoCoachCaller,
} from '@/lib/v2/convo/sideChannel/coachCall';
import {
  collectFreeContextCandidates,
  contextMatchCoachEg,
  matchContextLine,
  type ContextLine,
} from '@/lib/v2/convo/sideChannel/matchContext';
import type { ThreadFrame } from '@/lib/v2/convo/topics';
import type { ConvoTurnStreamEvent } from '@/lib/v2/convo/turn/types';
import { extractCoachPhrase } from './coachPhrase';
import { fitFrameFromArabic } from './frameFit';

export const FREE_COACH_TIMEOUT_MS = 6_000;

export type FreeSideKind = 'arabic_answer' | 'language_question' | 'other';

export type FreeArabicSideResult = {
  /** PT phrase for the learner to practise (G6), if any. */
  coachPhrase: string | null;
};

export type FreeSideContext = {
  candidates: ContextLine[];
  characterName?: string | null;
};

/**
 * Free-chat Arabic/English side channel (Batch 9 C8 + side-channel fix).
 * Character waits; thread does not advance; Arabic/English never enters exchanges.
 */
export async function handleFreeArabicSide(opts: {
  kind: FreeSideKind;
  learnerText: string;
  frame?: ThreadFrame | null;
  emit: (event: ConvoTurnStreamEvent) => void;
  coachCaller?: ConvoCoachCaller;
  /** S3: conversation lines for no-model answers. */
  context?: FreeSideContext | null;
}): Promise<FreeArabicSideResult> {
  const { kind, learnerText, frame, emit } = opts;

  // S3: answer from conversation context first (language questions + other).
  if (kind === 'language_question' || kind === 'other') {
    const candidates =
      opts.context?.candidates ??
      collectFreeContextCandidates({ frame: frame ?? null });
    const hit = matchContextLine(learnerText, candidates);
    if (hit) {
      const eg = contextMatchCoachEg(hit.tl, opts.context?.characterName);
      emit({
        type: 'coach',
        id: 'free_context_match',
        eg,
        moment: kind === 'language_question' ? 'language_question' : kind,
      });
      return { coachPhrase: hit.tl.replace(/[💪😅😊🔥]+/gu, '').trim() };
    }
  }

  if (kind === 'arabic_answer' || kind === 'other') {
    const fitted = fitFrameFromArabic(learnerText, frame);
    if (fitted) {
      emit({
        type: 'coach',
        id: 'free_frame_fit',
        eg: `بالبرتغالي: «${fitted}» — جرّب تقولها`,
        moment: 'arabic_answer',
      });
      return { coachPhrase: fitted };
    }
  }

  const caller =
    opts.coachCaller ?? createLiveConvoCoachCaller(FREE_COACH_TIMEOUT_MS);
  const hints = (frame?.chips ?? []).map((tl, i) => ({
    id: `chip${i}`,
    tl,
  }));
  if (frame?.tl) hints.unshift({ id: 'frame', tl: frame.tl });

  const contextLines = (opts.context?.candidates ?? [])
    .slice(0, 8)
    .map((c) => ({
      tl: c.tl,
      ...(c.ar ? { ar: c.ar } : {}),
    }));

  const result = await caller({
    learnerQuestion: learnerText,
    itemHints: hints,
    ...(contextLines.length > 0 ? { contextLines } : {}),
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
  return { coachPhrase: extractCoachPhrase(eg) };
}
