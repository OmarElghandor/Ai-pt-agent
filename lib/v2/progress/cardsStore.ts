import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { isFlashcardItem } from '@/lib/v2/content/flashcards';
import type { Item } from '@/lib/v2/content/items';
import {
  V2ItemStateModel,
  V2ReportModel,
  V2SessionModel,
} from '@/lib/v2/mongo/models';
import {
  applyCardRating,
  applyKnow,
  buildTodayQueue,
  createCardsSession,
  createItemState,
  failKnowCheck,
  isKnowCheckDue,
  localDateString,
  markCardRated,
  reopenCardsSession,
  tryGraduate,
  type CardCandidate,
  type CardRating,
  type CardsSession,
  type ItemState,
} from '@/lib/v2/progress';

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
        bucket: (q.bucket as 'recent' | 'weak' | 'older') ?? 'recent',
        rating: q.rating as CardsSession['queue'][0]['rating'],
        rated_at: q.rated_at
          ? new Date(q.rated_at).toISOString()
          : undefined,
      })),
      tz,
    });
  }

  const states = await V2ItemStateModel()
    .find({ user_id: opts.user_id })
    .lean();
  const stateById = new Map(
    states.map((s) => [
      s.item_id,
      docToState(s as unknown as Record<string, unknown>),
    ]),
  );

  // Seed from items if provided (introduced but not yet in state)
  for (const item of opts.items ?? []) {
    if (!isFlashcardItem(item)) continue;
    if (stateById.has(item.id)) continue;
    const st = createItemState({
      user_id: opts.user_id,
      item_id: item.id,
      introducedDay: opts.currentDay,
    });
    stateById.set(item.id, st);
  }

  const reportCounts = await openReportCounts([...stateById.keys()]);
  const candidates: CardCandidate[] = [];
  for (const [itemId, state] of stateById) {
    const item = opts.items?.find((i) => i.id === itemId);
    const eligible = item ? isFlashcardItem(item) : true;
    candidates.push({
      item_id: itemId,
      introducedDay: state.introducedDay,
      state,
      isWeak: (state.weakToolIds?.length ?? 0) > 0,
      hasOpenReports: (reportCounts.get(itemId) ?? 0) >= 2,
      eligible,
    });
  }

  const queue = buildTodayQueue({
    currentDay: opts.currentDay,
    now,
    candidates,
  });
  const session = createCardsSession({
    user_id: opts.user_id,
    local_date,
    queue,
    tz,
  });

  await V2SessionModel().create({
    user_id: session.user_id,
    kind: 'cards',
    local_date: session.local_date,
    status: session.status,
    queue: session.queue,
    tz,
  });

  return session;
}

export async function reviewCard(opts: {
  user_id: string;
  item_id: string;
  rating: CardRating;
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
      bucket: (q.bucket as 'recent' | 'weak' | 'older') ?? 'recent',
      rating: q.rating as CardsSession['queue'][0]['rating'],
      rated_at: q.rated_at ? new Date(q.rated_at).toISOString() : undefined,
    })),
    tz,
  };

  if (!session.queue.some((q) => q.item_id === opts.item_id)) {
    return { error: 'not_in_queue' };
  }

  let stateDoc = await V2ItemStateModel()
    .findOne({ user_id: opts.user_id, item_id: opts.item_id })
    .lean();
  let state = stateDoc
    ? docToState(stateDoc as unknown as Record<string, unknown>)
    : createItemState({
        user_id: opts.user_id,
        item_id: opts.item_id,
        introducedDay: 1,
      });

  if (opts.rating === 'know') {
    state = applyKnow(state, now);
  } else if (
    state.card.masteryLevel === 'mastered' &&
    isKnowCheckDue(state, now) &&
    opts.rating === 'again'
  ) {
    state = failKnowCheck(state, now);
  } else if (
    state.card.masteryLevel === 'mastered' &&
    isKnowCheckDue(state, now) &&
    (opts.rating === 'easy' || opts.rating === 'hard')
  ) {
    // passed know check — clear knowCheckDueAt, stay mastered
    state = {
      ...state,
      card: {
        ...applyCardRating(
          { ...state.card, masteryLevel: 'learning' },
          opts.rating,
          now,
        ),
        masteryLevel: 'mastered',
        knowCheckDueAt: null,
      },
    };
  } else {
    state = {
      ...state,
      card: applyCardRating(state.card, opts.rating, now),
    };
    state = tryGraduate(state);
  }

  await saveState(state);
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

  return { session, state };
}
