import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { isFlashcardItem } from '@/lib/v2/content/flashcards';
import type { Item } from '@/lib/v2/content/items';
import {
  V2ItemStateModel,
  V2ReportModel,
  V2SessionModel,
} from '@/lib/v2/mongo/models';
import {
  buildTodayQueue,
  createCardsSession,
  createItemState,
  localDateString,
  markCardRated,
  reopenCardsSession,
  type CardBucket,
  type CardCandidate,
  type CardRating,
  type CardsSession,
  type ItemState,
} from '@/lib/v2/progress';
import { loadWeakItemIds } from '@/lib/v2/progress/weakItems';

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
    opt_in_card: Boolean(doc.opt_in_card),
    stage: ([1, 2, 3, 4].includes(Number(doc.stage))
      ? Number(doc.stage)
      : 1) as 1 | 2 | 3 | 4,
    stage_at: (doc.stage_at as string | null) ?? null,
    stage_answer_id: (doc.stage_answer_id as string | null) ?? null,
    first_recognition_at: (doc.first_recognition_at as string | null) ?? null,
    first_recall_at: (doc.first_recall_at as string | null) ?? null,
  };
}

async function saveState(state: ItemState): Promise<void> {
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
        ...(state.opt_in_card ? { opt_in_card: true } : {}),
        stage: state.stage ?? 1,
        stage_at: state.stage_at ?? null,
        stage_answer_id: state.stage_answer_id ?? null,
        first_recognition_at: state.first_recognition_at ?? null,
        first_recall_at: state.first_recall_at ?? null,
      },
    },
    { upsert: true },
  );
}

async function openReportCounts(
  itemIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!itemIds.length) return map;
  const rows = await V2ReportModel()
    .aggregate<{ _id: string; n: number }>([
      {
        $match: {
          item_id: { $in: itemIds },
          $or: [{ status: 'open' }, { status: { $exists: false } }],
        },
      },
      { $group: { _id: '$item_id', n: { $sum: 1 } } },
    ])
    .exec();
  for (const r of rows) map.set(r._id, r.n);
  return map;
}

/**
 * Get or create today's frozen cards session for the user.
 */
export async function getOrCreateTodayCards(opts: {
  user_id: string;
  currentDay: number;
  timeZone?: string;
  target_lang?: string;
  /** Item bank used to seed first-seen states / eligibility. */
  items?: Item[];
  now?: Date;
}): Promise<CardsSession> {
  if (!mongoConfigured()) {
    throw new Error('MongoDB not configured');
  }
  await connectMongo();
  const now = opts.now ?? new Date();
  const tz = opts.timeZone ?? 'UTC';
  const local_date = localDateString(now, tz);

  const existing = await V2SessionModel()
    .findOne({
      user_id: opts.user_id,
      kind: 'cards',
      local_date,
    })
    .lean();

  if (existing) {
    return reopenCardsSession({
      user_id: opts.user_id,
      kind: 'cards',
      local_date,
      status: existing.status === 'done' ? 'done' : 'open',
      queue: (existing.queue ?? []).map((q) => ({
        item_id: q.item_id,
        bucket: (q.bucket as CardBucket) ?? 'recent',
        rating: q.rating as CardsSession['queue'][0]['rating'],
        rated_at: q.rated_at
          ? new Date(q.rated_at).toISOString()
          : undefined,
      })),
      tz,
    });
  }

  const candidates = await loadCardCandidates({
    user_id: opts.user_id,
    currentDay: opts.currentDay,
    items: opts.items,
  });

  const { V2LessonProgressModel } = await import('@/lib/v2/mongo/models');
  const {
    PHASE1_STORY_DAYS,
    buildPracticeWindow,
    cardsBudgetSeconds,
    normalizeUserPractice,
    splitDailyBudget,
  } = await import('@/lib/v2/practice');
  const mongoose = await import('mongoose');
  const target_lang = opts.target_lang ?? 'pt-PT';

  const completedDocs = await V2LessonProgressModel()
    .find({
      user_id: opts.user_id,
      target_lang,
      status: 'completed',
      day: { $lt: opts.currentDay },
    })
    .select('day')
    .lean();
  const completedDays = completedDocs.map((d) => Number(d.day));
  const window = buildPracticeWindow({
    currentDay: opts.currentDay,
    completedDays,
    storyDays: PHASE1_STORY_DAYS,
  });

  const currentProgress = await V2LessonProgressModel()
    .findOne({
      user_id: opts.user_id,
      target_lang,
      day: opts.currentDay,
    })
    .select('status')
    .lean();
  const hasLessonToday =
    currentProgress?.status !== 'completed' &&
    currentProgress?.status !== 'scheduled';

  let dailyMinutes = 30;
  try {
    const db = mongoose.default.connection.db;
    if (db) {
      const userDoc = await db.collection('v2_users').findOne({
        $or: [
          { _id: opts.user_id as unknown as import('mongoose').Types.ObjectId },
          { id: opts.user_id },
        ],
      });
      dailyMinutes = normalizeUserPractice(
        (userDoc as { practice?: unknown } | null)?.practice,
      ).daily_minutes;
    }
  } catch {
    // default
  }

  const split = splitDailyBudget({
    daily_minutes: dailyMinutes,
    has_lesson_today: Boolean(hasLessonToday),
  });
  const budgetSeconds = cardsBudgetSeconds(split.cards_minutes);

  const queue = buildTodayQueue({
    currentDay: opts.currentDay,
    now,
    candidates,
    window,
    budgetSeconds,
    hasLessonToday: Boolean(hasLessonToday),
    dailyMinutes,
  });
  const session = createCardsSession({
    user_id: opts.user_id,
    local_date,
    queue,
    tz,
    window,
    budget_minutes: split.cards_minutes,
  });

  try {
    await V2SessionModel().create({
      user_id: session.user_id,
      kind: 'cards',
      local_date: session.local_date,
      status: session.status,
      queue: session.queue,
      tz,
    });
  } catch (err) {
    // Concurrent taps: unique user×kind×date — return the winner (16 / reviewStore).
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: number }).code === 11000
    ) {
      const again = await V2SessionModel()
        .findOne({
          user_id: opts.user_id,
          kind: 'cards',
          local_date,
        })
        .lean();
      if (again) {
        return reopenCardsSession({
          user_id: opts.user_id,
          kind: 'cards',
          local_date,
          status: again.status === 'done' ? 'done' : 'open',
          queue: (again.queue ?? []).map((q) => ({
            item_id: q.item_id,
            bucket: (q.bucket as CardBucket) ?? 'recent',
            rating: q.rating as CardsSession['queue'][0]['rating'],
            rated_at: q.rated_at
              ? new Date(q.rated_at).toISOString()
              : undefined,
          })),
          tz,
        });
      }
    }
    throw err;
  }

  // Mirror into v2_card_decks (doc 11 / 16) — build once per local date.
  try {
    const { randomUUID } = await import('node:crypto');
    const { createMongoProgressStore, handleProgressEvent } = await import(
      '@/lib/v2/progress/events'
    );
    await handleProgressEvent(
      {
        kind: 'deck_opened',
        event_id: randomUUID(),
        target_lang: 'pt-PT',
        local_date,
        cards: session.queue.map((q) => ({
          item_id: q.item_id,
          slot: q.bucket as
            | 'recent'
            | 'weak'
            | 'older'
            | 'window'
            | 'maint',
        })),
      },
      {
        userId: opts.user_id,
        timezone: tz,
        now,
        store: createMongoProgressStore(),
      },
    );
    const { V2CardDeckModel } = await import('@/lib/v2/mongo/models');
    await V2CardDeckModel().updateOne(
      { user_id: opts.user_id, local_date },
      {
        $set: {
          window,
          budget_minutes: split.cards_minutes,
          round: 1,
        },
      },
    );
  } catch {
    // Deck mirror is best-effort alongside legacy v2_sessions.
  }

  return session;
}

/**
 * How many cards `buildTodayQueue` would pick at `now`. Does not write a session.
 * Used for "بكرة N" (pass the end of tomorrow).
 */
export async function countQueueAt(opts: {
  user_id: string;
  currentDay: number;
  now: Date;
  items?: Item[];
}): Promise<number> {
  const candidates = await loadCardCandidates({
    user_id: opts.user_id,
    currentDay: opts.currentDay,
    items: opts.items,
  });
  return buildTodayQueue({
    currentDay: opts.currentDay,
    now: opts.now,
    candidates,
  }).length;
}

async function loadCardCandidates(opts: {
  user_id: string;
  currentDay: number;
  items?: Item[];
}): Promise<CardCandidate[]> {
  const states = await V2ItemStateModel()
    .find({ user_id: opts.user_id })
    .lean();
  const stateById = new Map(
    states.map((s) => [
      s.item_id,
      docToState(s as unknown as Record<string, unknown>),
    ]),
  );

  for (const item of opts.items ?? []) {
    const existing = stateById.get(item.id);
    const opted = Boolean(existing?.opt_in_card);
    if (!isFlashcardItem(item) && !opted) continue;
    if (stateById.has(item.id)) continue;
    stateById.set(
      item.id,
      createItemState({
        user_id: opts.user_id,
        item_id: item.id,
        introducedDay: opts.currentDay,
      }),
    );
  }

  const [reportCounts, weakIds] = await Promise.all([
    openReportCounts([...stateById.keys()]),
    loadWeakItemIds(opts.user_id),
  ]);
  const candidates: CardCandidate[] = [];
  for (const [itemId, state] of stateById) {
    const item = opts.items?.find((i) => i.id === itemId);
    const eligible = item
      ? isFlashcardItem(item) || Boolean(state.opt_in_card)
      : Boolean(state.opt_in_card);
    candidates.push({
      item_id: itemId,
      introducedDay: state.introducedDay,
      state,
      isWeak: weakIds.has(itemId) || (state.weakToolIds?.length ?? 0) > 0,
      hasOpenReports: (reportCounts.get(itemId) ?? 0) >= 2,
      eligible,
    });
  }
  return candidates;
}

/**
 * Per-user «+ للكروت» — opt a real-world (or any) phrase into this user's deck.
 * Idempotent.
 */
export async function addUserCard(opts: {
  user_id: string;
  item_id: string;
  introducedDay: number;
  target_lang?: string;
  now?: Date;
}): Promise<{ state: ItemState; created: boolean } | { error: string }> {
  if (!mongoConfigured()) return { error: 'MongoDB not configured' };
  await connectMongo();
  const now = opts.now ?? new Date();
  const existing = await V2ItemStateModel()
    .findOne({ user_id: opts.user_id, item_id: opts.item_id })
    .lean();
  if (existing && Boolean((existing as { opt_in_card?: boolean }).opt_in_card)) {
    return {
      state: docToState(existing as unknown as Record<string, unknown>),
      created: false,
    };
  }
  const base = existing
    ? docToState(existing as unknown as Record<string, unknown>)
    : createItemState({
        user_id: opts.user_id,
        item_id: opts.item_id,
        introducedDay: opts.introducedDay,
        target_lang: opts.target_lang,
      });
  const state: ItemState = {
    ...base,
    opt_in_card: true,
    card: {
      ...base.card,
      dueAt: base.card.dueAt ?? now.toISOString(),
      masteryLevel: 'learning',
    },
  };
  await saveState(state);
  return { state, created: !existing };
}

export async function reviewCard(opts: {
  user_id: string;
  item_id: string;
  rating: CardRating;
  hint?: boolean;
  timeZone?: string;
  now?: Date;
}): Promise<{ session: CardsSession; state: ItemState } | { error: string }> {
  if (!mongoConfigured()) return { error: 'MongoDB not configured' };
  await connectMongo();
  const now = opts.now ?? new Date();
  const tz = opts.timeZone ?? 'UTC';
  const local_date = localDateString(now, tz);

  const sessionDoc = await V2SessionModel()
    .findOne({ user_id: opts.user_id, kind: 'cards', local_date })
    .lean();
  if (!sessionDoc) return { error: 'no_session' };
  if (sessionDoc.status === 'done') return { error: 'session_done' };

  let session: CardsSession = {
    user_id: opts.user_id,
    kind: 'cards',
    local_date,
    status: 'open',
    queue: (sessionDoc.queue ?? []).map((q) => ({
      item_id: q.item_id,
      bucket: (q.bucket as CardBucket) ?? 'recent',
      rating: q.rating as CardsSession['queue'][0]['rating'],
      rated_at: q.rated_at ? new Date(q.rated_at).toISOString() : undefined,
    })),
    tz,
  };

  const queueEntry = session.queue.find((q) => q.item_id === opts.item_id);
  if (!queueEntry) {
    return { error: 'not_in_queue' };
  }
  if (queueEntry.rating) {
    return { error: 'already_rated' };
  }

  // Item-state SRS + stages are written only by /api/v2/answers (card_review).
  // This path updates deck/session progress and mirrors the card_rated event.
  const stateDoc = await V2ItemStateModel()
    .findOne({ user_id: opts.user_id, item_id: opts.item_id })
    .lean();
  const state = stateDoc
    ? docToState(stateDoc as unknown as Record<string, unknown>)
    : createItemState({
        user_id: opts.user_id,
        item_id: opts.item_id,
        introducedDay: 1,
      });

  session = markCardRated(session, opts.item_id, opts.rating, now);

  await V2SessionModel().updateOne(
    { user_id: opts.user_id, kind: 'cards', local_date },
    {
      $set: {
        queue: session.queue.map((q) => ({
          item_id: q.item_id,
          bucket: q.bucket,
          rating: q.rating,
          rated_at: q.rated_at ? new Date(q.rated_at) : undefined,
        })),
        status: session.status,
      },
    },
  );

  try {
    const { randomUUID } = await import('node:crypto');
    const { createMongoProgressStore, handleProgressEvent } = await import(
      '@/lib/v2/progress/events'
    );
    await handleProgressEvent(
      {
        kind: 'card_rated',
        event_id: randomUUID(),
        target_lang: 'pt-PT',
        item_id: opts.item_id,
        rating: opts.rating,
        local_date,
      },
      {
        userId: opts.user_id,
        timezone: tz,
        now,
        store: createMongoProgressStore(),
      },
    );
  } catch {
    // Progress-events mirror is best-effort.
  }

  return { session, state };
}
