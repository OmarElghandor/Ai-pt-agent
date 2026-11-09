import type {
  FreeTextCorrection,
  FreeTextGrader,
} from '@/lib/v2/grader';
import { gradeFreeText, noFreeTextCorrection } from '@/lib/v2/grader';
import type { ConvoTurnStreamEvent } from '@/lib/v2/convo/turn/types';

export type CorrectionEmitPayload = FreeTextCorrection & {
  learner_turn_id: string;
  original: string;
};

export function buildCorrectionEvent(
  payload: CorrectionEmitPayload,
): Extract<ConvoTurnStreamEvent, { type: 'correction' }> {
  return {
    type: 'correction',
    learner_turn_id: payload.learner_turn_id,
    severity: payload.severity,
    corrected_tl: payload.corrected_tl,
    changes: payload.changes,
    main_error: payload.main_error,
    note_eg: payload.note_eg,
    ar: payload.ar,
    original: payload.original,
  };
}

/**
 * Await a started correction promise (with a short remaining budget) and emit
 * if there is an error. Never throws.
 */
export async function awaitAndEmitCorrection(opts: {
  promise: Promise<FreeTextCorrection>;
  learner_turn_id: string;
  original: string;
  emit: (event: ConvoTurnStreamEvent) => void;
  /** Max wait after character reply (ms). */
  waitMs?: number;
}): Promise<FreeTextCorrection> {
  const waitMs = opts.waitMs ?? 2_500;
  try {
    const result = await Promise.race([
      opts.promise,
      new Promise<FreeTextCorrection>((resolve) =>
        setTimeout(() => resolve(noFreeTextCorrection()), waitMs),
      ),
    ]);
    if (result.has_error && result.severity !== 'none') {
      opts.emit(
        buildCorrectionEvent({
          ...result,
          learner_turn_id: opts.learner_turn_id,
          original: opts.original,
        }),
      );
    }
    return result;
  } catch {
    return noFreeTextCorrection();
  }
}

export function startFreeTextCorrection(
  input: {
    answer: string;
    character_tl?: string;
    frame_tl?: string;
    frame_chips?: string[];
  },
  grader?: FreeTextGrader,
): Promise<FreeTextCorrection> {
  const run = grader ?? gradeFreeText;
  return run({
    answer: input.answer,
    character_tl: input.character_tl,
    frame_tl: input.frame_tl,
    frame_chips: input.frame_chips,
    level: 'A1',
  });
}
