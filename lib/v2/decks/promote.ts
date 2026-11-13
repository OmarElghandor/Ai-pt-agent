import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  V2CustomDeckModel,
  V2CustomItemModel,
  V2OfficialDeckModel,
} from '@/lib/v2/mongo/models';
import { isCustomItemId } from './keys';

export async function createOfficialDraftFromCustom(
  customDeckId: string,
): Promise<{ ok: true; official_id: string } | { ok: false; reason: string }> {
  if (!mongoConfigured()) return { ok: false, reason: 'mongo' };
  await connectMongo();
  const src = await V2CustomDeckModel().findById(customDeckId).lean();
  if (!src) return { ok: false, reason: 'not_found' };
  if (src.status === 'promoted' && src.promoted_to) {
    return { ok: true, official_id: src.promoted_to };
  }

  const draft = await V2OfficialDeckModel().create({
    target_lang: src.target_lang,
    title_tl: src.title_tl,
    title_ar: src.title_ar,
    tags: src.tags ?? [],
    item_ids: [...(src.item_ids ?? [])],
    status: 'draft',
    source_deck: String(src._id),
  });
  const official_id = String(draft._id);
  await V2CustomDeckModel().updateOne(
    { _id: customDeckId },
    { $set: { promoted_to: official_id } },
  );
  return { ok: true, official_id };
}

export async function updateOfficialDraft(opts: {
  official_id: string;
  title_tl?: string;
  title_ar?: string;
  item_ids?: string[];
}): Promise<boolean> {
  if (!mongoConfigured()) return false;
  await connectMongo();
  const $set: Record<string, unknown> = {};
  if (opts.title_tl != null) $set.title_tl = opts.title_tl;
  if (opts.title_ar != null) $set.title_ar = opts.title_ar;
  if (opts.item_ids != null) $set.item_ids = opts.item_ids;
  const res = await V2OfficialDeckModel().updateOne(
    { _id: opts.official_id, status: 'draft' },
    { $set },
  );
  return (res.matchedCount ?? 0) > 0;
}

export async function editCustomItemText(opts: {
  item_id: string;
  tl?: string;
  ar?: string;
  eg_note?: string;
  example_tl?: string;
  example_ar?: string;
  say?: string;
}): Promise<boolean> {
  if (!mongoConfigured() || !isCustomItemId(opts.item_id)) return false;
  await connectMongo();
  const $set: Record<string, unknown> = { reviewed: true };
  for (const key of [
    'tl',
    'ar',
    'eg_note',
    'example_tl',
    'example_ar',
    'say',
  ] as const) {
    if (opts[key] != null) $set[key] = opts[key];
  }
  const res = await V2CustomItemModel().updateOne(
    { id: opts.item_id },
    { $set },
  );
  return (res.matchedCount ?? 0) > 0;
}

/**
 * Publish official draft → مواضيع. Same item ids (no progress migration).
 * Marks custom items official; source deck promoted and leaves public list.
 */
export async function publishOfficialDeck(
  official_id: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!mongoConfigured()) return { ok: false, reason: 'mongo' };
  await connectMongo();
  const deck = await V2OfficialDeckModel().findById(official_id).lean();
  if (!deck || deck.status !== 'draft') {
    return { ok: false, reason: 'not_draft' };
  }

  await V2OfficialDeckModel().updateOne(
    { _id: official_id },
    { $set: { status: 'published' } },
  );

  const customIds = (deck.item_ids ?? []).filter(isCustomItemId);
  if (customIds.length > 0) {
    await V2CustomItemModel().updateMany(
      { id: { $in: customIds } },
      { $set: { status: 'official' } },
    );
  }

  if (deck.source_deck) {
    await V2CustomDeckModel().updateOne(
      { _id: deck.source_deck },
      {
        $set: {
          status: 'promoted',
          promoted_to: official_id,
          visibility: 'hidden',
        },
      },
    );
  }

  return { ok: true };
}
