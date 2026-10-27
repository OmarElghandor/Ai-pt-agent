import type { Item } from '@/lib/v2/content/items';
import type { Skill } from '@/lib/v2/content/lesson';
import { gradeAnswer, type GradeResponse } from '@/lib/v2/grader';
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
import type { AnswerPayload } from './payload';
import { resolveToolId } from './toolId';

export type AnswerVerdict = {
  ok: true;
  verdict: GradeResponse['verdict'] | 'correct' | 'wrong' | 'arabic_only';
  correct: boolean;
  accent_only: boolean;
  skill?: Skill;
  item_id?: string;
  tool_id?: string;
  errors: ProgressError[];
  called_grader: boolean;
  /** Mutated item state after this answer (caller persists). */
  item_state?: ItemState;
  /** Newly detected weak tool_id, if any. */
  weak_tool_id?: string | null;
  duplicate?: boolean;
};

export type EvaluateContext = {
  user_id: string;
  localDate: string;
  now?: Date;
  /** Existing state for the primary item, if any. */
  itemState?: ItemState | null;
  introducedDay?: number;
  items?: Item[];
  grammarFocusId?: string | null;
  /** For page_ask: whether option_index is the correct option. */
  pageAskCorrect?: boolean;
  pageAskItemId?: string;
  pageToolId?: string | null;
  /** For page_quiz: whether option is correct + tested ids. */
  pageQuizCorrect?: boolean;
  pageQuizItemIds?: string[];
  pageQuizSkill?: Skill;
  /** Prior errors for weak-area detection (last ~10). */
  recentErrors?: ProgressError[];
};

/**
 * Pure evaluation + in-memory progress update.
 * Does not touch Mongo. Never calls grader for closed/accent/arabic_only.
 */
export async function evaluateAnswer(
  payload: AnswerPayload,
  ctx: EvaluateContext,
): Promise<AnswerVerdict> {
  const now = ctx.now ?? new Date();
  const errors: ProgressError[] = [];

  const finish = (partial: Omit<AnswerVerdict, 'ok' | 'errors'> & {
    errors?: ProgressError[];
  }): AnswerVerdict => ({
    ok: true,
    errors: partial.errors ?? errors,
    ...partial,
  });

  if (payload.kind === 'page_ask' || payload.kind === 'page_quiz') {
    const correct =
      payload.kind === 'page_ask'
        ? Boolean(ctx.pageAskCorrect)
        : Boolean(ctx.pageQuizCorrect);
    const itemId =
      payload.kind === 'page_ask'
        ? ctx.pageAskItemId
        : ctx.pageQuizItemIds?.[0];
    const skill: Skill =
      payload.kind === 'page_quiz'
        ? (ctx.pageQuizSkill ?? 'reading')
        : 'reading';
    const tool_id = resolveToolId({
      itemId,
      items: ctx.items,
      grammarFocusId: ctx.grammarFocusId,
      pageToolId: ctx.pageToolId,
    });
    return applyClosedResult({
      correct,
      skill,
      itemId,
      tool_id,
      ctx,
      now,
      day: payload.day,
    });
  }

  if (payload.kind === 'closed') {
    const correct = payload.option_index === payload.correct_index;
    const tool_id =
      payload.tool_id ??
      resolveToolId({
        itemId: payload.item_id,
        items: ctx.items,
        grammarFocusId: ctx.grammarFocusId,
      });
    return applyClosedResult({
      correct,
      skill: payload.skill,
      itemId: payload.item_id,
      tool_id,
      ctx,
      now,
      day: payload.day,
    });
  }

  // open
  const skill = payload.skill;
  const tool_id =
    payload.tool_id ??
    resolveToolId({
      itemId: payload.item_id,
      items: ctx.items,
      grammarFocusId: ctx.grammarFocusId,
    });

  if (isArabicOnly(payload.text)) {
    return finish({
      verdict: 'arabic_only',
      correct: false,
      accent_only: false,
      skill,
      item_id: payload.item_id,
      tool_id,
      called_grader: false,
      item_state: ctx.itemState
        ? applyImplicitWrongUse(ctx.itemState, now)
        : undefined,
    });
  }

  const accepted = payload.accepted ?? [];
  if (accepted.length > 0) {
    const m = matchAnswer(payload.text, accepted);
    if (m.kind === 'exact' || m.kind === 'accent') {
      const accent_only = m.kind === 'accent';
      if (accent_only) {
        errors.push({
          user_id: ctx.user_id,
          item_id: payload.item_id,
          tool_id,
          skill,
          ...accentError({
            answer: payload.text,
            expected: accepted[0]!,
            item_id: payload.item_id,
            tool_id,
          }),
          at: now.toISOString(),
        });
      }
      const state = updateStateCorrect({
        ctx,
        itemId: payload.item_id,
        skill,
        day: payload.day,
        now,
      });
      return finish({
        verdict: 'correct',
        correct: true,
        accent_only,
        skill,
        item_id: payload.item_id,
        tool_id,
        called_grader: false,
        item_state: state,
        errors,
      });
    }

    // miss with accepted list — classify in code, no grader
    const classified = classifyMiss({
      answer: payload.text,
      expected: accepted[0]!,
      item_id: payload.item_id,
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
    const recent = [...(ctx.recentErrors ?? []), ...errors];
    const weak = weakToolAfterError(recent);
    let state = ctx.itemState
      ? applyImplicitWrongUse(ctx.itemState, now)
      : undefined;
    if (state && weak) {
      state = {
        ...state,
        weakToolIds: [...new Set([...state.weakToolIds, weak])],
      };
    }
    return finish({
      verdict: 'wrong',
      correct: false,
      accent_only: false,
      skill,
      item_id: payload.item_id,
      tool_id,
      called_grader: false,
      item_state: state,
      weak_tool_id: weak,
      errors,
    });
  }

  // No accepted list — grader stub
  const graded = await gradeAnswer({
    skill,
    answer: payload.text,
    item_ids: payload.item_id ? [payload.item_id] : [],
    tool_id,
  });
  const correct = graded.verdict === 'correct' || graded.verdict === 'near_miss';
  let state = ctx.itemState ?? undefined;
  if (payload.item_id) {
    if (correct) {
      state = updateStateCorrect({
        ctx,
        itemId: payload.item_id,
        skill,
        day: payload.day,
        now,
      });
    } else if (state) {
      state = applyImplicitWrongUse(state, now);
    }
  }
  return finish({
    verdict: graded.verdict,
    correct,
    accent_only: false,
    skill,
    item_id: payload.item_id,
    tool_id,
    called_grader: true,
    item_state: state,
  });
}

function applyClosedResult(opts: {
  correct: boolean;
  skill: Skill;
  itemId?: string;
  tool_id?: string;
  ctx: EvaluateContext;
  now: Date;
  day: number;
}): AnswerVerdict {
  const { correct, skill, itemId, tool_id, ctx, now, day } = opts;
  let state: ItemState | undefined;
  if (itemId) {
    if (correct) {
      state = updateStateCorrect({
        ctx,
        itemId,
        skill,
        day,
        now,
      });
    } else if (ctx.itemState) {
      state = applyImplicitWrongUse(ctx.itemState, now);
    } else {
      state = createItemState({
        user_id: ctx.user_id,
        item_id: itemId,
        introducedDay: ctx.introducedDay ?? day,
      });
      state = applyImplicitWrongUse(state, now);
    }
  }
  return {
    ok: true,
    verdict: correct ? 'correct' : 'wrong',
    correct,
    accent_only: false,
    skill,
    item_id: itemId,
    tool_id,
    called_grader: false,
    item_state: state,
    errors: [],
  };
}

function updateStateCorrect(opts: {
  ctx: EvaluateContext;
  itemId?: string;
  skill: Skill;
  day: number;
  now: Date;
}): ItemState | undefined {
  const { ctx, itemId, skill, day, now } = opts;
  if (!itemId) return ctx.itemState ?? undefined;
  let state =
    ctx.itemState ??
    createItemState({
      user_id: ctx.user_id,
      item_id: itemId,
      introducedDay: ctx.introducedDay ?? day,
    });
  state = bumpLevelsForSkill(state, skill, true);
  state = bumpSkill(state, skill, true, now);
  const imp = applyImplicitCorrectUse(state, {
    curriculumDay: day,
    localDate: ctx.localDate,
    now,
  });
  return tryGraduate(imp.state);
}
