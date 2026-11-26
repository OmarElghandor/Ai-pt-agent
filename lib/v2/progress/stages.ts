/**
 * Mastery stages (16 §6): اتعرّفت → راجعتها → افتكرتها → اتحفظت.
 * Pure — only `/api/v2/answers` (and helpers it calls) write these fields.
 */

import type { ItemState } from './types';

export type MasteryStage = 1 | 2 | 3 | 4;

export const STAGE_NAMES = {
  1: 'اتعرّفت',
  2: 'راجعتها',
  3: 'افتكرتها',
  4: 'اتحفظت',
} as const;

export type StageEvidenceKind =
  | 'recognition'
  | 'production'
  | 'know'
  | 'miss'
  | 'seen';

export type StageEvidence = {
  kind: StageEvidenceKind;
  /** Local date YYYY-MM-DD. */
  localDate: string;
  /** Correct first-try (required for recognition/production advances). */
  correct?: boolean;
  firstTry?: boolean;
  /** Situation id for production (e.g. day:3). Cards never pass this. */
  situationId?: string | null;
  /** Cards never count as a situation. */
  fromCard?: boolean;
  /** Essential items need 3 situations for stage 4. */
  essential?: boolean;
  /** Hint on a card forces no recognition advance (متوسط/سهل without hint only). */
  hint?: boolean;
  /** Answer id that caused this evidence (recorded on stage moves). */
  answerId?: string;
};

export type StageMove = {
  item_id: string;
  from: number;
  to: number;
  answer_id?: string;
};

/** Diff before/after state; returns a move when the stage number changed. */
export function stageMoveFrom(
  before: ItemState | null | undefined,
  after: ItemState | null | undefined,
  answerId?: string,
): StageMove | null {
  if (!after) return null;
  const from = (before?.stage ?? 1) as number;
  const to = (after.stage ?? 1) as number;
  if (from === to) return null;
  return {
    item_id: after.item_id,
    from,
    to,
    answer_id: answerId ?? after.stage_answer_id ?? undefined,
  };
}

export function defaultStageFields(introducedDay?: number): Pick<
  ItemState,
  'stage' | 'stage_at' | 'first_recognition_at' | 'first_recall_at'
> {
  void introducedDay;
  return {
    stage: 1,
    stage_at: null,
    first_recognition_at: null,
    first_recall_at: null,
  };
}

function situationsNeeded(essential: boolean): number {
  return essential ? 3 : 2;
}

function withStageMove(
  next: ItemState,
  from: MasteryStage,
  to: MasteryStage,
  evidence: StageEvidence,
): ItemState {
  if (from === to) return next;
  return {
    ...next,
    stage: to,
    stage_at: evidence.localDate,
    stage_answer_id: evidence.answerId ?? next.stage_answer_id ?? null,
  };
}

/**
 * Apply one piece of evidence. Same-day advances stop at the next stage only.
 * Works for words, phrases, and patterns (`pattern.*` item ids).
 */
export function applyStageEvidence(
  state: ItemState,
  evidence: StageEvidence,
): ItemState {
  const stage = (state.stage ?? 1) as MasteryStage;
  const stageAt = state.stage_at;
  let next: ItemState = {
    ...state,
    stage,
    stage_at: stageAt ?? null,
    stage_answer_id: state.stage_answer_id ?? null,
    first_recognition_at: state.first_recognition_at ?? null,
    first_recall_at: state.first_recall_at ?? null,
    usedCorrectlyIn: [...(state.usedCorrectlyIn ?? [])],
  };

  if (evidence.kind === 'seen') {
    if (!next.stage || next.stage < 1) {
      next = withStageMove(next, stage, 1, evidence);
    }
    return next;
  }

  if (evidence.kind === 'know') {
    // عارفها → stage 3, never 4
    const target: MasteryStage = 3;
    if (stage < target) {
      next = {
        ...withStageMove(next, stage, target, evidence),
        first_recall_at: next.first_recall_at ?? evidence.localDate,
      };
    } else if (stage === 4) {
      // know does not keep 4; clamp to 3 for this rating path
      next = withStageMove(next, stage, 3, evidence);
    }
    return next;
  }

  if (evidence.kind === 'miss') {
    if (stage === 4) {
      return withStageMove(next, stage, 3, evidence);
    }
    if (stage === 3) {
      return withStageMove(next, stage, 2, evidence);
    }
    // stage 2 miss → stay 2; stage 1 → stay 1
    return next;
  }

  const correct = evidence.correct !== false;
  const firstTry = evidence.firstTry !== false;
  if (!correct || !firstTry) return next;

  if (evidence.kind === 'recognition') {
    if (evidence.hint) return next;
    if (stage >= 2) {
      // Recognition alone never advances past 2
      if (!next.first_recognition_at) {
        next = { ...next, first_recognition_at: evidence.localDate };
      }
      return next;
    }
    // stage 1 → 2 needs a different local day from stage_at (intro day)
    if (stageAt && stageAt === evidence.localDate) return next;
    next = {
      ...withStageMove(next, stage, 2, evidence),
      first_recognition_at: next.first_recognition_at ?? evidence.localDate,
    };
    return next;
  }

  if (evidence.kind === 'production') {
    // Cards never count as situations
    if (evidence.fromCard) return next;

    if (evidence.situationId && !evidence.fromCard) {
      if (!next.usedCorrectlyIn.includes(evidence.situationId)) {
        next = {
          ...next,
          usedCorrectlyIn: [...next.usedCorrectlyIn, evidence.situationId],
        };
      }
    }

    if (stage < 2) {
      // production without recognition: still need stage 2 first on a prior day —
      // same-day recognition+production → 2 only is handled by applying recognition first.
      // If somehow production arrives at stage 1, treat as recognition-equivalent only up to 2
      // when prior day allows, else no skip to 3.
      const prior = stageAt;
      if (!prior || prior !== evidence.localDate) {
        next = {
          ...withStageMove(next, stage, 2, evidence),
          first_recognition_at: next.first_recognition_at ?? evidence.localDate,
        };
      }
      return next;
    }

    if (stage === 2) {
      if (stageAt && stageAt === evidence.localDate) {
        // same day as stage 2 → cannot go to 3
        return next;
      }
      next = {
        ...withStageMove(next, stage, 3, evidence),
        first_recall_at: next.first_recall_at ?? evidence.localDate,
      };
      return next;
    }

    // stage 3 or 4: maybe graduate to 4
    if (stage >= 3) {
      if (!next.first_recall_at) {
        next = { ...next, first_recall_at: evidence.localDate };
      }
      const need = situationsNeeded(Boolean(evidence.essential));
      const intervalOk = next.card.interval >= 21;
      const situationsOk = next.usedCorrectlyIn.length >= need;
      // Cards never pushed situations; custom-only can graduate on interval in tryGraduate,
      // but stage 4 for curriculum needs situations. Custom-only: interval alone for stage 4.
      const customOnly = next.item_id.startsWith('ugc.');
      if (
        stage === 3 &&
        intervalOk &&
        (customOnly || situationsOk) &&
        (!stageAt || stageAt !== evidence.localDate)
      ) {
        next = withStageMove(next, stage, 4, evidence);
      }
    }
    return next;
  }

  return next;
}

/** Infer stage fields from an existing document (backfill). */
export function inferStageFromState(state: ItemState): ItemState {
  let stage: MasteryStage = 1;
  let stageAt: string | null = null;
  let firstRecognition: string | null = state.first_recognition_at ?? null;
  let firstRecall: string | null = state.first_recall_at ?? null;

  if (state.card.masteryLevel === 'mastered' && state.card.interval >= 21) {
    const need = 2;
    if (
      state.item_id.startsWith('ugc.') ||
      state.usedCorrectlyIn.length >= need
    ) {
      stage = 4;
    } else {
      stage = 3;
    }
  } else if (
    state.levels.said >= 1 ||
    state.levels.used >= 1 ||
    (state.card.interval ?? 0) >= 7
  ) {
    stage = 3;
  } else if (
    state.levels.heard >= 1 ||
    state.levels.understood >= 1 ||
    (state.card.interval ?? 0) > 0
  ) {
    stage = 2;
  }

  if (stage >= 2 && !firstRecognition) {
    firstRecognition = state.stage_at ?? null;
  }
  if (stage >= 3 && !firstRecall) {
    firstRecall = state.stage_at ?? null;
  }

  return {
    ...state,
    stage,
    stage_at: stageAt ?? state.stage_at ?? null,
    first_recognition_at: firstRecognition ?? null,
    first_recall_at: firstRecall ?? null,
  };
}

/** Map question / activity types to evidence kind. */
export function evidenceKindForQuestionType(
  type: string,
): StageEvidenceKind | null {
  const recognition = new Set([
    'listen_meaning',
    'read_meaning',
    'listen_pick_tl',
    'listen_pick_image',
    'pick_meaning',
    'pick_tl',
    'image_pick_tl',
    'choose_article',
    'complete_phrase',
    'fill_blank_choice',
    'situation_choice',
    'find_image',
    'micro_check',
    'card',
  ]);
  const production = new Set([
    'translate_write',
    'fill_blank_write',
    'dictation',
    'build_sentence',
    'say_it',
    'reply_write',
    'reply_speak',
    'describe_image_write',
    'describe_image_speak',
    'image_write',
    'image_say',
    'convo',
    'roleplay',
  ]);
  if (recognition.has(type)) return 'recognition';
  if (production.has(type)) return 'production';
  return null;
}
