import type { Item } from '@/lib/v2/content/items';
import type { PackBeat } from '@/lib/v2/content/pack';
import type { Skill } from '@/lib/v2/content/lesson';
import { gradeAnswer, type GradeResponse } from '@/lib/v2/grader';
import {
  reactAnswer,
  sanitizeReactorCharacter,
  type ReactorResponse,
} from '@/lib/v2/reactor';
import {
  applyImplicitCorrectUse,
  applyImplicitWrongUse,
  bumpLevelsForSkill,
  bumpSkill,
  createItemState,
  tryGraduate,
  type ItemState,
  type ProgressError,
} from '@/lib/v2/progress';
import { weakToolAfterError } from '@/lib/v2/progress/weakAreas';
import { isArabicOnly } from './arabicOnly';
import { accentError, classifyMiss } from './classify';
import { matchAnswer } from './match';
import type { BeatAnswerPayload } from './payload';
import { resolveToolId } from './toolId';
import { buildAcceptedVariants, expectedTlFromIds } from '@/lib/v2/generation/pack/accepted';
import { isAllowedCharacterTl } from '@/lib/v2/generation/pack/characterTl';

export type BeatEvaluateResult = {
  ok: true;
  verdict: GradeResponse['verdict'];
  correct: boolean;
  accent_only: boolean;
  accent_note?: string;
  skill: Skill;
  attempt: 1 | 2;
  advance: boolean;
  character_tl?: string;
  coach_eg?: string;
  corrected_tl?: string;
  errors: ProgressError[];
  called_grader: boolean;
  called_reactor: boolean;
  item_states: ItemState[];
  weak_tool_id?: string | null;
  items_used_correctly: string[];
  next_beat_id?: string | null;
};

export type BeatEvaluateContext = {
  user_id: string;
  localDate: string;
  now?: Date;
  beat: PackBeat;
  items: Item[];
  /** Server attempt after this submission (1 or 2). */
  attempt: 1 | 2;
  /** True if attempt 1 already logged an error for this beat. */
  hadPriorError: boolean;
  itemStates: Map<string, ItemState>;
  recentErrors?: ProgressError[];
  character_name: string;
  character_role?: string;
  next_beat_id?: string | null;
  grammarFocusId?: string | null;
};

export async function evaluateBeat(
  payload: BeatAnswerPayload,
  ctx: BeatEvaluateContext,
): Promise<BeatEvaluateResult> {
  const now = ctx.now ?? new Date();
  const beat = ctx.beat;
  let skill: Skill = payload.switched_to_writing ? 'writing' : payload.skill;
  if (payload.switched_to_writing) skill = 'writing';

  const byId = new Map(ctx.items.map((i) => [i.id, i]));
  const primaryIds =
    skill === 'listening' || skill === 'reading'
      ? beat.prompt_ids
      : beat.expected_ids.length
        ? beat.expected_ids
        : beat.prompt_ids;
  const primaryId = primaryIds[0];
  const tool_id = resolveToolId({
    itemId: primaryId,
    items: ctx.items,
    grammarFocusId: ctx.grammarFocusId,
  });

  const empty = (
    partial: Partial<BeatEvaluateResult> & {
      verdict: GradeResponse['verdict'];
      correct: boolean;
      advance: boolean;
    },
  ): BeatEvaluateResult => ({
    ok: true,
    accent_only: false,
    skill,
    attempt: ctx.attempt,
    errors: [],
    called_grader: false,
    called_reactor: false,
    item_states: [],
    items_used_correctly: [],
    next_beat_id: partial.advance ? ctx.next_beat_id : null,
    ...partial,
  });

  // Closed listening / reading
  if (skill === 'listening' || skill === 'reading') {
    const opts = beat.options ?? [];
    const chosen =
      opts.find((o) => o.id === payload.option_id) ??
      (typeof payload.text === 'string'
        ? opts.find((o) => o.label === payload.text)
        : undefined);
    const correct = Boolean(chosen?.correct);
    const advance = true;
    const states = correct
      ? applyCorrectStates(ctx, primaryIds, skill, payload.day, now, false)
      : applyWrongStates(ctx, primaryIds, now);

    const nextTl =
      correct && beat.next_character_tl
        ? isAllowedCharacterTl(beat.next_character_tl, [...byId.values()])
          ? beat.next_character_tl
          : undefined
        : undefined;
    return empty({
      verdict: correct ? 'correct' : 'wrong',
      correct,
      advance,
      character_tl: nextTl,
      coach_eg: correct ? undefined : beat.coach_fallback_eg,
      item_states: states,
      items_used_correctly: correct ? primaryIds : [],
      next_beat_id: advance ? ctx.next_beat_id : null,
    });
  }

  const text = (payload.text ?? '').trim();
  if (isArabicOnly(text)) {
    return empty({
      verdict: 'arabic_only',
      correct: false,
      advance: false,
      coach_eg: 'حلو! قولها بالبرتغالي',
      next_beat_id: null,
    });
  }

  const expectedTl =
    beat.expected_tl ||
    expectedTlFromIds(beat.expected_ids, byId) ||
    '';
  const accepted =
    beat.accepted?.length
      ? beat.accepted
      : buildAcceptedVariants(expectedTl);

  let verdict: GradeResponse['verdict'] = 'wrong';
  let accent_only = false;
  let corrected_tl = expectedTl;
  let feedback_ar = '';
  let gradeErrors: GradeResponse['errors'] = [];
  let mainErrorIdx: number | null = null;
  let called_grader = false;
  let items_used_correctly: string[] = [];

  if (accepted.length > 0) {
    const m = matchAnswer(text, accepted);
    if (m.kind === 'exact' || m.kind === 'accent') {
      verdict = 'correct';
      accent_only = m.kind === 'accent';
      items_used_correctly = primaryIds;
    }
  }

  if (verdict !== 'correct') {
    const graded = await gradeAnswer({
      skill,
      prompt_tl: beat.prompt_tl ?? expectedTl,
      accepted,
      answer: text,
      answer_source: payload.answer_source === 'voice' ? 'speech' : 'typed',
      item_ids: primaryIds,
      tool_id,
    });
    called_grader = true;
    verdict = graded.verdict;
    corrected_tl = graded.corrected_tl || expectedTl;
    feedback_ar = graded.feedback_ar;
    gradeErrors = graded.errors;
    mainErrorIdx = graded.main_error;
    items_used_correctly = graded.items_used_correctly.length
      ? graded.items_used_correctly
      : verdict === 'correct'
        ? primaryIds
        : [];
  }

  // unclear / off_topic attempt handling
  if (verdict === 'unclear') {
    return empty({
      verdict: 'unclear',
      correct: false,
      advance: false,
      coach_eg: 'مسمعتش كويس — قولها تاني',
      called_grader,
      next_beat_id: null,
    });
  }

  const errors: ProgressError[] = [];
  if (accent_only && primaryId) {
    errors.push({
      user_id: ctx.user_id,
      item_id: primaryId,
      tool_id,
      skill,
      ...accentError({
        answer: text,
        expected: expectedTl,
        item_id: primaryId,
        tool_id,
      }),
      at: now.toISOString(),
    });
  }

  const isMiss =
    verdict === 'near_miss' ||
    verdict === 'wrong' ||
    verdict === 'off_topic';

  if (isMiss && gradeErrors.length && primaryId) {
    const ge =
      mainErrorIdx != null && gradeErrors[mainErrorIdx]
        ? gradeErrors[mainErrorIdx]!
        : gradeErrors[0]!;
    errors.push({
      user_id: ctx.user_id,
      item_id: ge.item_id ?? primaryId,
      tool_id: ge.tool_id ?? tool_id,
      skill,
      category: ge.category,
      scope: ge.scope,
      wrong: ge.wrong,
      right: ge.right,
      at: now.toISOString(),
    });
  } else if (isMiss && !gradeErrors.length && primaryId) {
    const classified = classifyMiss({
      answer: text,
      expected: expectedTl,
      item_id: primaryId,
      tool_id,
    });
    if (classified) {
      errors.push({
        user_id: ctx.user_id,
        skill,
        ...classified,
        at: now.toISOString(),
      });
    }
  }

  const recent = [...(ctx.recentErrors ?? []), ...errors];
  const weak = errors.length ? weakToolAfterError(recent) : null;

  // Progress
  let item_states: ItemState[] = [];
  const skipEasy = ctx.attempt === 2 && ctx.hadPriorError;

  if (verdict === 'correct' || accent_only) {
    item_states = applyCorrectStates(
      ctx,
      primaryIds,
      skill,
      payload.day,
      now,
      skipEasy,
    );
  } else if (isMiss && ctx.attempt >= 2) {
    // Final miss — record wrong
    item_states = applyWrongStates(ctx, primaryIds, now, weak);
  } else if (isMiss && ctx.attempt === 1) {
    // Log error but don't advance SRS wrong yet beyond error row; still soft-mark
    item_states = [];
  }

  let reaction: ReactorResponse | undefined;
  let called_reactor = false;
  let advance = false;
  let character_tl: string | undefined;
  let coach_eg: string | undefined;

  if (verdict === 'correct' || accent_only) {
    advance = true;
    character_tl = beat.next_character_tl;
    coach_eg = accent_only ? 'تمام — خلّي بالك من النبرة بس' : undefined;
  } else if (
    (verdict === 'near_miss' ||
      verdict === 'wrong' ||
      verdict === 'off_topic') &&
    (skill === 'speaking' || skill === 'writing')
  ) {
    called_reactor = true;
    const main =
      errors[0]
        ? {
            scope: errors[0].scope,
            wrong: errors[0].wrong,
            right: errors[0].right,
            feedback_ar: feedback_ar || undefined,
            category: errors[0].category,
          }
        : null;
    reaction = await reactAnswer({
      skill,
      verdict,
      attempt: ctx.attempt,
      prompt_tl: beat.prompt_tl,
      answer: text,
      corrected_tl,
      main_error: main,
      weak_spot: Boolean(weak),
      character_name: ctx.character_name,
      character_role: ctx.character_role,
      coach_fallback_eg: beat.coach_fallback_eg,
    });
    const bank = [...byId.values()];
    const charOk = reaction.character_tl
      ? isAllowedCharacterTl(reaction.character_tl, bank)
      : true;
    reaction = sanitizeReactorCharacter(reaction, { ok: charOk });
    advance = reaction.advance || ctx.attempt >= 2;
    character_tl = reaction.character_tl;
    coach_eg = reaction.coach_eg ?? beat.coach_fallback_eg;
    if (ctx.attempt >= 2) {
      advance = true;
      if (!coach_eg) coach_eg = `الصحيح: ${corrected_tl || expectedTl}`;
    }
  } else {
    advance = ctx.attempt >= 2;
    coach_eg = beat.coach_fallback_eg;
  }

  return {
    ok: true,
    verdict: accent_only ? 'correct' : verdict,
    correct: verdict === 'correct' || accent_only,
    accent_only,
    accent_note: accent_only ? 'خلّي بالك من النبرة' : undefined,
    skill,
    attempt: ctx.attempt,
    advance,
    character_tl: advance ? character_tl ?? beat.next_character_tl : character_tl,
    coach_eg,
    corrected_tl: isMiss ? corrected_tl : undefined,
    errors,
    called_grader,
    called_reactor,
    item_states,
    weak_tool_id: weak,
    items_used_correctly,
    next_beat_id: advance ? ctx.next_beat_id : null,
  };
}

function applyCorrectStates(
  ctx: BeatEvaluateContext,
  itemIds: string[],
  skill: Skill,
  day: number,
  now: Date,
  skipCardReview: boolean,
): ItemState[] {
  const out: ItemState[] = [];
  for (const itemId of itemIds) {
    let state =
      ctx.itemStates.get(itemId) ??
      createItemState({
        user_id: ctx.user_id,
        item_id: itemId,
        introducedDay: day,
      });
    state = bumpLevelsForSkill(state, skill, true);
    state = bumpSkill(state, skill, true, now);
    const imp = applyImplicitCorrectUse(state, {
      curriculumDay: day,
      localDate: ctx.localDate,
      now,
      skipCardReview,
    });
    out.push(tryGraduate(imp.state));
  }
  return out;
}

function applyWrongStates(
  ctx: BeatEvaluateContext,
  itemIds: string[],
  now: Date,
  weak?: string | null,
): ItemState[] {
  const out: ItemState[] = [];
  for (const itemId of itemIds) {
    let state =
      ctx.itemStates.get(itemId) ??
      createItemState({
        user_id: ctx.user_id,
        item_id: itemId,
        introducedDay: 1,
      });
    state = applyImplicitWrongUse(state, now);
    if (weak) {
      state = {
        ...state,
        weakToolIds: [...new Set([...state.weakToolIds, weak])],
      };
    }
    out.push(state);
  }
  return out;
}
