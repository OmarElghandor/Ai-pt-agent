import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  V2CustomDeckJobModel,
  V2CustomDeckModel,
  V2CustomItemModel,
} from '@/lib/v2/mongo/models';

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
