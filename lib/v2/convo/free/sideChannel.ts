import {
  COACH_CALL_FALLBACK_EG,
  createLiveConvoCoachCaller,
  type ConvoCoachCaller,
} from '@/lib/v2/convo/sideChannel/coachCall';
import {
  contextMatchCoachSegments,
  flattenCoachSegments,
  frameFallbackCoachSegments,
  frameFitCoachSegments,
  splitCoachEgToSegments,
  type CoachSegment,
} from '@/lib/v2/convo/sideChannel/coachSegments';
import {
  collectFreeContextCandidates,
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

function emitCoach(
  emit: (event: ConvoTurnStreamEvent) => void,
  opts: {
    id: string;
    moment: string;
    segments: CoachSegment[];
  },
): void {
  emit({
    type: 'coach',
    id: opts.id,
    eg: flattenCoachSegments(opts.segments),
    moment: opts.moment,
    segments: opts.segments,
  });
}

/**
 * Free-chat Arabic/English side channel (Batch 9 C8 + side-channel fix).
 * Fallback order (S5): context match → coach model → frame → generic.
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

  // 1. S3: answer from conversation context first.
  if (kind === 'language_question' || kind === 'other') {
    const candidates =
      opts.context?.candidates ??
      collectFreeContextCandidates({ frame: frame ?? null });
    const hit = matchContextLine(learnerText, candidates);
    if (hit) {
      const segments = contextMatchCoachSegments(
        hit.tl,
        opts.context?.characterName,
      );
      emitCoach(emit, {
        id: 'free_context_match',
        moment: kind === 'language_question' ? 'language_question' : kind,
        segments,
      });
      return { coachPhrase: hit.tl.replace(/[💪😅😊🔥]+/gu, '').trim() };
    }
  }

  if (kind === 'arabic_answer' || kind === 'other') {
    const fitted = fitFrameFromArabic(learnerText, frame);
    if (fitted) {
      const segments = frameFitCoachSegments(fitted);
      emitCoach(emit, {
        id: 'free_frame_fit',
        moment: 'arabic_answer',
        segments,
      });
      return { coachPhrase: fitted };
    }
  }

  // 2. Coach model (S4).
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

  const modelOk =
    !result.timedOut &&
    !result.error &&
    result.eg &&
    result.eg !== COACH_CALL_FALLBACK_EG;

  if (modelOk) {
    let eg = result.eg;
    if (!eg.includes('جرّب تقولها')) {
      eg = `${eg.replace(/\s+$/, '')} — جرّب تقولها`;
    }
    const segments = splitCoachEgToSegments(eg);
    emitCoach(emit, {
      id: kind === 'language_question' ? 'free_lang_q' : 'free_ar_coach',
      moment: kind,
      segments,
    });
    return { coachPhrase: extractCoachPhrase(eg) };
  }

  // 3. Frame template fallback.
  if (frame?.tl?.trim()) {
    const segments = frameFallbackCoachSegments(frame.tl);
    emitCoach(emit, {
      id: 'free_frame_fallback',
      moment: kind,
      segments,
    });
    return { coachPhrase: extractCoachPhrase(flattenCoachSegments(segments)) };
  }

  // 4. Generic last resort.
  emitCoach(emit, {
    id: kind === 'language_question' ? 'free_lang_q' : 'free_ar_coach',
    moment: kind,
    segments: [{ type: 'eg', text: COACH_CALL_FALLBACK_EG }],
  });
  return { coachPhrase: null };
}
