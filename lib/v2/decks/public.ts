import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  V2CustomDeckModel,
  V2OfficialDeckModel,
  V2UserDeckModel,
} from '@/lib/v2/mongo/models';

export type PublicDeckTile = {
  id: string;
  title_tl: string;
  title_ar: string;
  word_count: number;
  added_count: number;
  tags: string[];
  created_at?: string;
};

export async function listPublicLearnerDecks(opts: {
  sort?: 'popular' | 'new';
  q?: string;
  page?: number;
  pageSize?: number;
  targetLang?: string;
}): Promise<{ decks: PublicDeckTile[]; total: number }> {
  if (!mongoConfigured()) return { decks: [], total: 0 };
  await connectMongo();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 20));
  const filter: Record<string, unknown> = {
    target_lang: opts.targetLang ?? 'pt-PT',
    visibility: 'public',
    status: 'custom',
  };
  if (opts.q?.trim()) {
    filter.$text = { $search: opts.q.trim() };
  }
  const sort: Record<string, 1 | -1> =
    opts.sort === 'new' ? { createdAt: -1 } : { added_count: -1 };

  const [total, docs] = await Promise.all([
    V2CustomDeckModel().countDocuments(filter),
    V2CustomDeckModel()
      .find(filter)
      .sort(sort)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
  ]);

  return {
    total,
    decks: docs.map((d) => ({
      id: String(d._id),
      title_tl: d.title_tl,
      title_ar: d.title_ar,
      word_count: (d.item_ids ?? []).length,
      added_count: d.added_count ?? 0,
      tags: d.tags ?? [],
      created_at: d.createdAt
        ? new Date(d.createdAt as Date).toISOString()
        : undefined,
    })),
  };
}

export async function listOfficialThemeDecks(opts?: {
  targetLang?: string;
}): Promise<PublicDeckTile[]> {
  if (!mongoConfigured()) return [];
  await connectMongo();
  const docs = await V2OfficialDeckModel()
    .find({
      target_lang: opts?.targetLang ?? 'pt-PT',
      status: 'published',
    })
    .sort({ updatedAt: -1 })
    .lean();
  return docs.map((d) => ({
    id: String(d._id),
    title_tl: d.title_tl,
    title_ar: d.title_ar,
    word_count: (d.item_ids ?? []).length,
    added_count: 0,
    tags: d.tags ?? [],
  }));
}

export async function listMyDecks(user_id: string): Promise<
  Array<PublicDeckTile & { deck_kind: 'custom' | 'official' }>
> {
  if (!mongoConfigured()) return [];
  await connectMongo();
  const links = await V2UserDeckModel().find({ user_id }).lean();
  const out: Array<PublicDeckTile & { deck_kind: 'custom' | 'official' }> = [];
  for (const link of links) {
    if (link.deck_kind === 'official') {
      const d = await V2OfficialDeckModel().findById(link.deck_id).lean();
      if (!d || d.status !== 'published') continue;
      out.push({
        id: String(d._id),
        title_tl: d.title_tl,
        title_ar: d.title_ar,
        word_count: (d.item_ids ?? []).length,
        added_count: 0,
        tags: d.tags ?? [],
        deck_kind: 'official',
      });
    } else {
      const d = await V2CustomDeckModel().findById(link.deck_id).lean();
      if (!d) continue;
      out.push({
        id: String(d._id),
        title_tl: d.title_tl,
        title_ar: d.title_ar,
        word_count: (d.item_ids ?? []).length,
        added_count: d.added_count ?? 0,
        tags: d.tags ?? [],
        deck_kind: 'custom',
      });
    }
  }
  return out;
}

export async function addDeckToUser(opts: {
  user_id: string;
  deck_id: string;
  deck_kind?: 'custom' | 'official';
}): Promise<{ ok: true; already?: boolean } | { ok: false; reason: string }> {
  if (!mongoConfigured()) return { ok: false, reason: 'mongo' };
  await connectMongo();
  const kind = opts.deck_kind ?? 'custom';
  if (kind === 'custom') {
    const deck = await V2CustomDeckModel().findById(opts.deck_id).lean();
    if (!deck) return { ok: false, reason: 'not_found' };
  } else {
    const deck = await V2OfficialDeckModel().findById(opts.deck_id).lean();
    if (!deck || deck.status !== 'published') {
      return { ok: false, reason: 'not_found' };
    }
  }

  const existing = await V2UserDeckModel()
    .findOne({ user_id: opts.user_id, deck_id: opts.deck_id })
    .lean();
  if (existing) return { ok: true, already: true };

  await V2UserDeckModel().create({
    user_id: opts.user_id,
    deck_id: opts.deck_id,
    deck_kind: kind,
    added_at: new Date(),
    new_cards_by_day: {},
  });
  if (kind === 'custom') {
    const updated = await V2CustomDeckModel().findOneAndUpdate(
      { _id: opts.deck_id },
      { $inc: { added_count: 1 } },
      { new: true },
    );
    const added = Number(updated?.added_count ?? 0);
    try {
      const { maybeEnqueueAfterAdd } = await import('@/lib/v2/decks/images');
      await maybeEnqueueAfterAdd({
        deckId: opts.deck_id,
        added_count: added,
      });
    } catch {
      // Image enqueue is best-effort; add still succeeds.
    }
  }
  return { ok: true };
}

export async function removeDeckFromUser(opts: {
  user_id: string;
  deck_id: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!mongoConfigured()) return { ok: false, reason: 'mongo' };
  await connectMongo();
  const res = await V2UserDeckModel().deleteOne({
    user_id: opts.user_id,
    deck_id: opts.deck_id,
  });
  if ((res.deletedCount ?? 0) === 0) return { ok: false, reason: 'not_found' };
  // Item states stay (per item, not per deck).
  return { ok: true };
}
