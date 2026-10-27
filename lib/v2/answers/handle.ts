import { getCurrentUserId } from '@/lib/auth/currentUser';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import type { Item } from '@/lib/v2/content/items';
import { getPublishedLesson } from '@/lib/v2/content/getPublishedLesson';
import type { Skill } from '@/lib/v2/content/lesson';
import {
  V2AnswerIdempotencyModel,
  V2ErrorModel,
  V2ItemStateModel,
} from '@/lib/v2/mongo/models';
import {
  createItemState,
  localDateString,
  type ItemState,
  type ProgressError,
} from '@/lib/v2/progress';
import {
  evaluateAnswer,
  type AnswerVerdict,
  type EvaluateContext,
} from './evaluate';
import { withIdempotency } from './idempotency';
import { parseAnswerPayload, type AnswerPayload } from './payload';

export type { AnswerVerdict };

function docToState(doc: Record<string, unknown>): ItemState {
  const card = (doc.card ?? {}) as Record<string, unknown>;
  const levels = (doc.levels ?? {}) as Record<string, number>;
  return {
    user_id: String(doc.user_id),
    item_id: String(doc.item_id),
    target_lang: String(doc.target_lang ?? 'pt-PT'),
    introducedDay: Number(doc.introducedDay ?? 1),
    usedCorrectlyIn: Array.isArray(doc.usedCorrectlyIn)
      ? (doc.usedCorrectlyIn as string[])
      : [],
    levels: {
      heard: levels.heard ?? 0,
      understood: levels.understood ?? 0,
      said: levels.said ?? 0,
      used: levels.used ?? 0,
    },
    skills: (doc.skills as ItemState['skills']) ?? {},
    card: {
      interval: Number(card.interval ?? 0),
      dueAt: card.dueAt
        ? new Date(card.dueAt as string | Date).toISOString()
        : null,
      masteryLevel:
        card.masteryLevel === 'mastered' ? 'mastered' : 'learning',
      consecutiveCorrect: Number(card.consecutiveCorrect ?? 0),
      face: String(card.face ?? 'recognize'),
      knowCheckDueAt: card.knowCheckDueAt
        ? new Date(card.knowCheckDueAt as string | Date).toISOString()
        : null,
    },
    lastImplicitReviewLocalDate:
      (doc.lastImplicitReviewLocalDate as string | null) ?? null,
    weakToolIds: Array.isArray(doc.weakToolIds)
      ? (doc.weakToolIds as string[])
      : [],
  };
}

async function loadItemState(
  userId: string,
  itemId: string,
): Promise<ItemState | null> {
  const doc = await V2ItemStateModel()
    .findOne({ user_id: userId, item_id: itemId })
    .lean();
  if (!doc) return null;
  return docToState(doc as unknown as Record<string, unknown>);
}

async function saveItemState(state: ItemState): Promise<void> {
  await V2ItemStateModel().findOneAndUpdate(
    { user_id: state.user_id, item_id: state.item_id },
    {
      $set: {
        target_lang: state.target_lang,
        introducedDay: state.introducedDay,
        usedCorrectlyIn: state.usedCorrectlyIn,
        levels: state.levels,
        skills: state.skills,
        card: {
          interval: state.card.interval,
          dueAt: state.card.dueAt ? new Date(state.card.dueAt) : null,
          masteryLevel: state.card.masteryLevel,
          consecutiveCorrect: state.card.consecutiveCorrect,
          face: state.card.face,
          knowCheckDueAt: state.card.knowCheckDueAt
            ? new Date(state.card.knowCheckDueAt)
            : null,
        },
        lastImplicitReviewLocalDate: state.lastImplicitReviewLocalDate,
        weakToolIds: state.weakToolIds,
      },
    },
    { upsert: true },
  );
}

async function appendErrors(errors: ProgressError[]): Promise<void> {
  if (!errors.length) return;
  await V2ErrorModel().insertMany(
    errors.map((e) => ({
      user_id: e.user_id,
      item_id: e.item_id,
      tool_id: e.tool_id,
      skill: e.skill,
      category: e.category,
      scope: e.scope,
      wrong: e.wrong,
      right: e.right,
      at: new Date(e.at),
    })),
  );
}

async function buildContext(
  payload: AnswerPayload,
  userId: string,
  tz: string,
): Promise<EvaluateContext> {
  const localDate = localDateString(new Date(), tz);
  const published = await getPublishedLesson(payload.day);
  const items: Item[] = published?.pack.items ?? [];
  const grammarFocusId =
    (published?.pack.lesson as { grammar_focus?: string } | undefined)
      ?.grammar_focus ?? null;

  const ctx: EvaluateContext = {
    user_id: userId,
    localDate,
    items,
    grammarFocusId,
  };

  if (payload.kind === 'page_ask' && published) {
    const page = published.pack.pages.find((p) => p.id === payload.page_id);
    const step = page?.steps?.[payload.step_index];
    if (step?.kind === 'ask') {
      const opt = step.ask.options[payload.option_index];
      ctx.pageAskCorrect = Boolean(opt?.correct);
      ctx.pageToolId = page?.tool_id ?? null;
      // best-effort item from target
      const target = step.target;
      if (target?.includes('item:')) {
        const idx = Number(target.split('item:')[1]);
        // leave undefined if not parseable
        void idx;
      }
    }
  }

  if (payload.kind === 'page_quiz' && published) {
    const q = published.pack.questions.find((x) => x.id === payload.question_id);
    if (q) {
      ctx.pageQuizSkill = q.skill as Skill;
      ctx.pageQuizItemIds = q.tests;
      const opts = Array.isArray(q.options) ? q.options : [];
      const chosen = opts[payload.option_index] as
        | { correct?: boolean }
        | undefined;
      if (chosen && typeof chosen.correct === 'boolean') {
        ctx.pageQuizCorrect = chosen.correct;
      } else if (typeof q.answer === 'number') {
        ctx.pageQuizCorrect = q.answer === payload.option_index;
      } else {
        ctx.pageQuizCorrect = false;
      }
    }
  }

  const itemId =
    payload.kind === 'open' || payload.kind === 'closed'
      ? payload.item_id
      : ctx.pageQuizItemIds?.[0] ?? ctx.pageAskItemId;

  if (itemId) {
    ctx.itemState = await loadItemState(userId, itemId);
    if (!ctx.itemState) {
      ctx.introducedDay = payload.day;
      ctx.itemState = createItemState({
        user_id: userId,
        item_id: itemId,
        introducedDay: payload.day,
      });
    }
    const recent = await V2ErrorModel()
      .find({ user_id: userId, tool_id: { $exists: true } })
      .sort({ at: -1 })
      .limit(10)
      .lean();
    ctx.recentErrors = recent.map((r) => ({
      user_id: userId,
      item_id: r.item_id ?? undefined,
      tool_id: r.tool_id ?? undefined,
      skill: (r.skill as Skill | undefined) ?? undefined,
      category: r.category as ProgressError['category'],
      scope: r.scope,
      wrong: r.wrong,
      right: r.right,
      at: new Date(r.at).toISOString(),
    }));
  }

  return ctx;
}

export type HandleAnswerResult =
  | { status: 400 | 401 | 403 | 503; error: string }
  | { status: 200; body: AnswerVerdict };

export async function handleAnswerRequest(
  body: unknown,
  opts?: { timeZone?: string },
): Promise<HandleAnswerResult> {
  const payload = parseAnswerPayload(body);
  if (!payload) {
    return { status: 400, error: 'invalid' };
  }
  if (!mongoConfigured()) {
    return { status: 503, error: 'MongoDB not configured' };
  }
  const userId = getCurrentUserId();
  if (!userId) {
    return { status: 401, error: 'unauthorized' };
  }

  await connectMongo();
  const tz = opts?.timeZone ?? 'UTC';

  const store = {
    async get(id: string) {
      const doc = await V2AnswerIdempotencyModel()
        .findOne({ answer_id: id, user_id: userId })
        .lean();
      if (!doc) return undefined;
      return doc.verdict as AnswerVerdict;
    },
    async set(id: string, verdict: AnswerVerdict) {
      await V2AnswerIdempotencyModel().create({
        answer_id: id,
        user_id: userId,
        verdict,
      });
    },
  };

  try {
    const verdict = await withIdempotency(payload.answer_id, store, async () => {
      const ctx = await buildContext(payload, userId, tz);
      const result = await evaluateAnswer(payload, ctx);
      if (!result.duplicate && result.item_state) {
        await saveItemState(result.item_state);
      }
      if (!result.duplicate && result.errors.length) {
        await appendErrors(result.errors);
      }
      return result;
    });
    return { status: 200, body: verdict };
  } catch (err) {
    // Duplicate key on race: re-read
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: number }).code === 11000
    ) {
      const existing = await store.get(payload.answer_id);
      if (existing) {
        return { status: 200, body: { ...existing, duplicate: true } };
      }
    }
    throw err;
  }
}
