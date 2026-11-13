import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  V2CardDeckModel,
  V2ItemStateModel,
  V2SessionModel,
  V2UserDeckModel,
} from '@/lib/v2/mongo/models';
import { createItemState, emptyCardSrs } from '@/lib/v2/progress/srs';
import { userLocalDate } from '@/lib/v2/progress/userLocalDate';
import { getAnyDeckDetail } from './detail';

export type RatedQueueItem = {
  item_id: string;
  rating?: string | null;
  rated_at?: string | Date | null;
  hint?: boolean | null;
  bucket?: string;
  slot?: string;
};

/**
 * Clear ratings on queue/deck cards that belong to the reset item set.
 * Pure helper — does not touch Mongo.
 */
export function clearRatingsForItems<T extends RatedQueueItem>(
  items: T[],
  itemIds: Set<string>,
): { items: T[]; cleared: number } {
  let cleared = 0;
  const next = items.map((row) => {
    if (!itemIds.has(row.item_id)) return row;
    if (row.rating == null && row.rated_at == null && !row.hint) return row;
    cleared += 1;
    const { rating: _r, rated_at: _a, hint: _h, ...rest } = row;
    return { ...rest } as T;
  });
  return { items: next, cleared };
}

export function sessionStatusAfterClear(
  items: { rating?: string | null }[],
  previousStatus: 'open' | 'done',
): 'open' | 'done' {
  if (items.some((row) => row.rating == null)) return 'open';
  return previousStatus;
}

/** Mongo filter for card SRS reset — always scoped to one learner. */
export function itemStateResetFilter(user_id: string, item_ids: string[]) {
  return { user_id, item_id: { $in: item_ids } };
}

/** Membership row filter — never touches shared deck documents. */
export function userDeckResetFilter(user_id: string, bare_deck_id: string) {
  return { user_id, deck_id: bare_deck_id };
}

function bareUgCDeckId(deckId: string): {
  kind: 'custom' | 'official';
  id: string;
} | null {
  if (deckId.startsWith('custom:')) {
    return { kind: 'custom', id: deckId.slice('custom:'.length) };
  }
  if (deckId.startsWith('official:')) {
    return { kind: 'official', id: deckId.slice('official:'.length) };
  }
  if (/^[a-f0-9]{24}$/i.test(deckId)) {
    return { kind: 'custom', id: deckId };
  }
  return null;
}

/**
 * Reset this learner's card SRS for every item in the deck.
 * Never mutates shared deck documents or other users' progress.
 */
export async function resetDeck(opts: {
  user_id: string;
  deckId: string;
  currentDay: number;
  now?: Date;
  timeZone?: string | null;
}): Promise<{ ok: true; reset_count: number } | { ok: false; reason: string }> {
  if (!mongoConfigured()) return { ok: false, reason: 'mongo' };
  await connectMongo();

  const detail = await getAnyDeckDetail({
    user_id: opts.user_id,
    deckId: opts.deckId,
    currentDay: opts.currentDay,
  });
  if (!detail) return { ok: false, reason: 'not_found' };

  const itemIds = detail.items.map((row) => row.item_id);
  const itemIdSet = new Set(itemIds);
  const blank = emptyCardSrs();
  const blankCard = {
    interval: blank.interval,
    dueAt: blank.dueAt ? new Date(blank.dueAt) : null,
    masteryLevel: blank.masteryLevel,
    consecutiveCorrect: blank.consecutiveCorrect,
    face: blank.face,
    knowCheckDueAt: blank.knowCheckDueAt
      ? new Date(blank.knowCheckDueAt)
      : null,
  };

  let reset_count = 0;
  if (itemIds.length > 0) {
    // Upsert blank card for every deck item so the next custom session
    // puts them all on the uncapped "due" path (dueAt: null), not the
    // ≤10 new/day path for never-seen ids.
    const ops = itemIds.map((item_id) => {
      const seed = createItemState({
        user_id: opts.user_id,
        item_id,
        introducedDay: 1,
      });
      return {
        updateOne: {
          filter: { user_id: opts.user_id, item_id },
          update: {
            $set: { card: blankCard },
            $setOnInsert: {
              user_id: opts.user_id,
              item_id,
              target_lang: seed.target_lang,
              introducedDay: seed.introducedDay,
              usedCorrectlyIn: [],
              levels: seed.levels,
              skills: {},
              lastImplicitReviewLocalDate: null,
              weakToolIds: [],
              opt_in_card: true,
            },
          },
          upsert: true,
        },
      };
    });
    await V2ItemStateModel().bulkWrite(ops, { ordered: false });
    // Every deck item now has a blank card for this user.
    reset_count = itemIds.length;
  }

  const ugc = bareUgCDeckId(detail.id);
  if (ugc) {
    await V2UserDeckModel().updateOne(
      { user_id: opts.user_id, deck_id: ugc.id },
      {
        $set: { new_cards_by_day: {} },
        $setOnInsert: {
          user_id: opts.user_id,
          deck_id: ugc.id,
          deck_kind: ugc.kind,
          added_at: new Date(),
        },
      },
      { upsert: true },
    );
  }

  const now = opts.now ?? new Date();
  const local_date = userLocalDate(opts.timeZone ?? null, now);

  const sessionDoc = await V2SessionModel()
    .findOne({
      user_id: opts.user_id,
      kind: 'cards',
      local_date,
    })
    .lean();

  if (sessionDoc?.queue?.length) {
    const { items: queue, cleared } = clearRatingsForItems(
      (sessionDoc.queue as RatedQueueItem[]).map((q) => ({
        item_id: q.item_id,
        bucket: q.bucket,
        rating: q.rating,
        rated_at: q.rated_at,
        hint: q.hint,
      })),
      itemIdSet,
    );
    if (cleared > 0) {
      const prev =
        sessionDoc.status === 'done' ? ('done' as const) : ('open' as const);
      await V2SessionModel().updateOne(
        { user_id: opts.user_id, kind: 'cards', local_date },
        {
          $set: {
            queue: queue.map((q) => ({
              item_id: q.item_id,
              bucket: q.bucket ?? 'recent',
              ...(q.rating != null ? { rating: q.rating } : {}),
              ...(q.rated_at != null ? { rated_at: q.rated_at } : {}),
            })),
            status: sessionStatusAfterClear(queue, prev),
          },
        },
      );
    }
  }

  const deckDoc = await V2CardDeckModel()
    .findOne({ user_id: opts.user_id, local_date })
    .lean();

  if (deckDoc?.cards?.length) {
    const { items: cards, cleared } = clearRatingsForItems(
      (deckDoc.cards as RatedQueueItem[]).map((c) => ({
        item_id: c.item_id,
        slot: c.slot,
        rating: c.rating,
        rated_at: c.rated_at,
        hint: c.hint,
      })),
      itemIdSet,
    );
    if (cleared > 0) {
      const prev =
        deckDoc.status === 'done' ? ('done' as const) : ('open' as const);
      const status = sessionStatusAfterClear(cards, prev);
      await V2CardDeckModel().updateOne(
        { user_id: opts.user_id, local_date },
        {
          $set: {
            cards: cards.map((c) => ({
              item_id: c.item_id,
              slot: c.slot ?? 'recent',
              ...(c.rating != null ? { rating: c.rating } : {}),
              ...(c.rated_at != null ? { rated_at: c.rated_at } : {}),
              ...(c.hint != null ? { hint: c.hint } : {}),
            })),
            status,
          },
          ...(status === 'open' ? { $unset: { done_at: 1 } } : {}),
        },
      );
    }
  }

  return { ok: true, reset_count };
}
