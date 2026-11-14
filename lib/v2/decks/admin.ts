import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  V2CustomDeckJobModel,
  V2CustomDeckModel,
  V2CustomItemModel,
  V2ImageModel,
  V2OfficialDeckModel,
} from '@/lib/v2/mongo/models';
import { isCustomItemId } from './keys';
import {
  imageKeyForConcept,
  posGetsImage,
} from './images';

export async function listAdminCustomDecks(opts?: {
  filter?: 'popular' | 'reported' | 'not_promoted' | 'all';
}) {
  if (!mongoConfigured()) return [];
  await connectMongo();
  const filter = opts?.filter ?? 'all';
  const q: Record<string, unknown> = {};
  if (filter === 'reported') q.report_count = { $gte: 1 };
  if (filter === 'not_promoted') q.status = 'custom';
  if (filter === 'popular') {
    /* sort only */
  }
  const docs = await V2CustomDeckModel()
    .find(q)
    .sort({ added_count: -1 })
    .limit(200)
    .lean();
  return docs.map((d) => ({
    id: String(d._id),
    title_tl: d.title_tl,
    title_ar: d.title_ar,
    topic: d.topic ?? null,
    visibility: d.visibility,
    status: d.status,
    report_count: d.report_count ?? 0,
    added_count: d.added_count ?? 0,
    images_status: d.images_status ?? 'none',
    word_count: (d.item_ids ?? []).length,
    created_by: d.created_by ?? null,
    promoted_to: d.promoted_to ?? null,
  }));
}

export async function setDeckVisibility(
  deckId: string,
  visibility: 'public' | 'hidden',
): Promise<boolean> {
  if (!mongoConfigured()) return false;
  await connectMongo();
  const res = await V2CustomDeckModel().updateOne(
    { _id: deckId },
    { $set: { visibility } },
  );
  return (res.modifiedCount ?? 0) > 0 || (res.matchedCount ?? 0) > 0;
}

export async function deleteCustomDeck(deckId: string): Promise<boolean> {
  if (!mongoConfigured()) return false;
  await connectMongo();
  const res = await V2CustomDeckModel().deleteOne({ _id: deckId });
  return (res.deletedCount ?? 0) > 0;
}

export async function removeWordFromDeck(
  deckId: string,
  itemId: string,
): Promise<boolean> {
  if (!mongoConfigured()) return false;
  await connectMongo();
  const res = await V2CustomDeckModel().updateOne(
    { _id: deckId },
    { $pull: { item_ids: itemId } },
  );
  await V2CustomItemModel().updateOne(
    { id: itemId },
    { $pull: { deck_ids: deckId } },
  );
  return (res.modifiedCount ?? 0) > 0 || (res.matchedCount ?? 0) > 0;
}

export async function costPerDay(local_date: string): Promise<{
  jobs: number;
  quota_jobs: number;
}> {
  if (!mongoConfigured()) return { jobs: 0, quota_jobs: 0 };
  await connectMongo();
  const [jobs, quota_jobs] = await Promise.all([
    V2CustomDeckJobModel().countDocuments({ local_date }),
    V2CustomDeckJobModel().countDocuments({
      local_date,
      counts_for_quota: true,
    }),
  ]);
  return { jobs, quota_jobs };
}

/**
 * Official themed decks for admin flashcards hub.
 * missing_images = imageable custom items whose word.<concept_en> is not ready.
 */
export async function listAdminOfficialDecks(): Promise<
  {
    id: string;
    title_tl: string;
    title_ar: string;
    status: string;
    word_count: number;
    source_deck: string | null;
    missing_images: number;
    images_status: 'none' | 'partial' | 'ready';
  }[]
> {
  if (!mongoConfigured()) return [];
  await connectMongo();
  const docs = await V2OfficialDeckModel()
    .find({})
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean();

  const out: {
    id: string;
    title_tl: string;
    title_ar: string;
    status: string;
    word_count: number;
    source_deck: string | null;
    missing_images: number;
    images_status: 'none' | 'partial' | 'ready';
  }[] = [];

  for (const d of docs) {
    const customIds = (d.item_ids ?? []).filter(isCustomItemId);
    const items = customIds.length
      ? await V2CustomItemModel()
          .find({ id: { $in: customIds } })
          .select({ id: 1, pos: 1, concept_en: 1 })
          .lean()
      : [];
    const keys = new Set<string>();
    for (const item of items) {
      if (!posGetsImage(String(item.pos))) continue;
      const concept = item.concept_en ? String(item.concept_en) : '';
      if (!concept) continue;
      keys.add(imageKeyForConcept(concept));
    }
    const keyList = [...keys];
    let ready = 0;
    if (keyList.length) {
      ready = await V2ImageModel().countDocuments({
        key: { $in: keyList },
        status: 'ready',
      });
    }
    const missing_images = Math.max(0, keyList.length - ready);
    const images_status =
      keyList.length === 0
        ? 'none'
        : missing_images === 0
          ? 'ready'
          : ready > 0
            ? 'partial'
            : 'none';
    out.push({
      id: String(d._id),
      title_tl: d.title_tl,
      title_ar: d.title_ar,
      status: d.status,
      word_count: (d.item_ids ?? []).length,
      source_deck: d.source_deck ? String(d.source_deck) : null,
      missing_images,
      images_status,
    });
  }
  return out;
}
