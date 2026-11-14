import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { mergeMustAvoid } from '@/lib/v2/images/forbidden';
import { estimateImageCostUsd, type ImageQuality } from '@/lib/v2/images/pricing';
import type { ImageSpec } from '@/lib/v2/generation/images/templates';
import {
  V2CustomDeckModel,
  V2CustomItemModel,
  V2ImageModel,
  V2JobModel,
  V2OfficialDeckModel,
} from '@/lib/v2/mongo/models';
import { isCustomItemId } from './keys';
import type { CustomItemPos } from './keys';
import type { DeckImagesStatus } from './types';

export const CUSTOM_DECK_IMAGE_THRESHOLD_DEFAULT = 5;

export function customDeckImageModelId(): string {
  return (
    process.env.CUSTOM_DECK_IMAGE_MODEL?.trim() ||
    process.env.OPENAI_IMAGE_MODEL?.trim() ||
    'gpt-image-2.5-flare-2026-09-08'
  );
}

export function customDeckImageQuality(): ImageQuality {
  const q = (process.env.CUSTOM_DECK_IMAGE_QUALITY ?? 'low').trim().toLowerCase();
  if (q === 'medium' || q === 'high' || q === 'low') return q;
  return 'low';
}

export function customDeckImageThreshold(): number {
  const n = Number(process.env.CUSTOM_DECK_IMAGE_THRESHOLD);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : CUSTOM_DECK_IMAGE_THRESHOLD_DEFAULT;
}

export function customDeckImageDailyLimit(): number {
  const n = Number(process.env.CUSTOM_DECK_IMAGE_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 50;
}

export function imageKeyForConcept(concept_en: string): string {
  return `word.${concept_en.trim().toLowerCase()}`;
}

export function deckUsedById(deckId: string): string {
  return `deck:${deckId}`;
}

/** Pure: phrases never get images. */
export function posGetsImage(pos: string): boolean {
  return pos === 'noun' || pos === 'verb' || pos === 'adjective';
}

export function buildCustomDeckImageSpec(opts: {
  pos: CustomItemPos | string;
  concept_en: string;
  ar: string;
  topic?: string;
}): ImageSpec | null {
  if (!posGetsImage(opts.pos)) return null;
  const setting = opts.topic?.trim() || 'a generic everyday place';
  const concept = opts.concept_en.trim();
  const meaning = opts.ar.trim();
  const avoid = mergeMustAvoid(undefined);

  if (opts.pos === 'noun') {
    return {
      type: 'object',
      subject: `${concept} in use`,
      setting,
      framing: 'close object-centered 1:1',
      intent: `clearly show ${concept} (${meaning}) in everyday use`,
      must_show: [concept, 'object clearly visible'],
      must_avoid: avoid,
    };
  }
  if (opts.pos === 'verb') {
    return {
      type: 'action',
      subject: `anonymous adult ${concept.replace(/^to_/, '')}`,
      setting,
      framing: 'medium 1:1',
      intent: `anonymous adult clearly doing ${concept} (${meaning})`,
      must_show: ['one anonymous adult', 'action readable'],
      must_avoid: avoid,
      characters: [],
    };
  }
  // adjective
  return {
    type: 'emotion',
    subject: `anonymous adult looking ${concept}`,
    setting,
    framing: 'medium 1:1',
    intent: `anonymous adult clearly showing ${concept} (${meaning})`,
    must_show: ['one anonymous adult', 'state readable'],
    must_avoid: avoid,
    characters: [],
  };
}

export type DeckImagePlanItem = {
  item_id: string;
  concept_en: string;
  key: string;
  pos: string;
  ar: string;
  status: string;
  needs_generate: boolean;
};

export type DeckImagePlan = {
  deck_id: string;
  topic: string;
  items: DeckImagePlanItem[];
  missing: DeckImagePlanItem[];
  reusable: DeckImagePlanItem[];
  skipped_phrases: number;
  estimate_usd: number;
  images_status: DeckImagesStatus;
};

/**
 * Pure planner over item + image-status rows (tests inject these).
 */
export function planFromRows(opts: {
  deck_id: string;
  topic?: string;
  rows: {
    item_id: string;
    pos: string;
    concept_en?: string | null;
    ar: string;
    image_status?: string | null;
  }[];
  force?: boolean;
  quality?: ImageQuality;
  model?: string;
}): DeckImagePlan {
  const quality = opts.quality ?? 'low';
  const model = opts.model ?? customDeckImageModelId();
  const items: DeckImagePlanItem[] = [];
  let skipped_phrases = 0;

  for (const row of opts.rows) {
    if (!posGetsImage(row.pos)) {
      skipped_phrases += 1;
      continue;
    }
    const concept = (row.concept_en ?? '').trim().toLowerCase();
    if (!concept) continue;
    const key = imageKeyForConcept(concept);
    const status = row.image_status ?? 'missing';
    items.push({
      item_id: row.item_id,
      concept_en: concept,
      key,
      pos: row.pos,
      ar: row.ar,
      status,
      needs_generate: opts.force || status !== 'ready',
    });
  }

  // Deduplicate by key — one generation per concept
  const byKey = new Map<string, DeckImagePlanItem>();
  for (const it of items) {
    const prev = byKey.get(it.key);
    if (!prev) {
      byKey.set(it.key, it);
      continue;
    }
    // Prefer needing generate if either needs it
    if (it.needs_generate) prev.needs_generate = true;
  }
  const unique = [...byKey.values()];
  const missing = unique.filter((i) => i.needs_generate);
  const reusable = unique.filter((i) => !i.needs_generate);
  const estimate_usd = missing.reduce(
    (sum) =>
      sum +
      estimateImageCostUsd({
        model,
        size: '1024x1024',
        quality,
      }),
    0,
  );

  let images_status: DeckImagesStatus = 'none';
  if (unique.length === 0) images_status = 'none';
  else if (reusable.length === unique.length) images_status = 'ready';
  else if (reusable.length > 0) images_status = 'partial';
  else images_status = 'none';

  return {
    deck_id: opts.deck_id,
    topic: opts.topic ?? '',
    items,
    missing,
    reusable,
    skipped_phrases,
    estimate_usd,
    images_status,
  };
}

export async function planDeckImages(opts: {
  deckId: string;
  force?: boolean;
}): Promise<DeckImagePlan | null> {
  if (!mongoConfigured()) return null;
  await connectMongo();

  const deck = await V2CustomDeckModel().findById(opts.deckId).lean();
  if (!deck) return null;

  const customIds = (deck.item_ids ?? []).filter(isCustomItemId);
  const items = await V2CustomItemModel()
    .find({ id: { $in: customIds } })
    .lean();

  const keys = items
    .map((i) =>
      i.concept_en ? imageKeyForConcept(String(i.concept_en)) : null,
    )
    .filter(Boolean) as string[];

  const imageDocs = keys.length
    ? await V2ImageModel()
        .find({ key: { $in: keys } })
        .select({ key: 1, status: 1 })
        .lean()
    : [];
  const statusByKey = new Map(
    imageDocs.map((d) => [String(d.key), String(d.status)] as const),
  );

  return planFromRows({
    deck_id: opts.deckId,
    topic: deck.topic ?? deck.title_tl,
    force: opts.force,
    quality: customDeckImageQuality(),
    model: customDeckImageModelId(),
    rows: items.map((i) => {
      const concept = i.concept_en ? String(i.concept_en) : '';
      const key = concept ? imageKeyForConcept(concept) : '';
      return {
        item_id: String(i.id),
        pos: String(i.pos),
        concept_en: concept || null,
        ar: String(i.ar),
        image_status: key ? (statusByKey.get(key) ?? 'missing') : 'missing',
      };
    }),
  });
}

export async function countImagesGeneratedToday(): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return V2ImageModel().countDocuments({
    updatedAt: { $gte: start },
    status: { $in: ['ready', 'flagged', 'generating', 'queued'] },
    kind: 'content',
  });
}

export type EnqueueCustomDeckImagesResult =
  | {
      ok: true;
      enqueued: number;
      keys: string[];
      reused: number;
      estimate_usd: number;
      images_status: DeckImagesStatus;
      capped?: boolean;
    }
  | { ok: false; reason: string; missing?: number; estimate_usd?: number };

/**
 * Enqueue missing custom-deck images. Admin may bypass threshold and daily cap
 * (with confirmOverCap). Automatic path respects the daily cap.
 */
export async function enqueueCustomDeckImages(opts: {
  deckId: string;
  admin?: boolean;
  force?: boolean;
  confirmOverCap?: boolean;
  itemId?: string;
}): Promise<EnqueueCustomDeckImagesResult> {
  if (!mongoConfigured()) return { ok: false, reason: 'mongo' };
  await connectMongo();

  let plan = await planDeckImages({
    deckId: opts.deckId,
    force: opts.force,
  });
  if (!plan) return { ok: false, reason: 'not_found' };

  if (opts.itemId) {
    const one = plan.items.filter((i) => i.item_id === opts.itemId);
    if (!one.length) return { ok: false, reason: 'item_not_found' };
    plan = {
      ...plan,
      missing: one.filter((i) => i.needs_generate || opts.force),
      reusable: one.filter((i) => !i.needs_generate && !opts.force),
    };
    if (opts.force) {
      plan.missing = one.map((i) => ({ ...i, needs_generate: true }));
      plan.reusable = [];
    }
  }

  const toEnqueue = plan.missing;
  if (!toEnqueue.length) {
    await V2CustomDeckModel().updateOne(
      { _id: opts.deckId },
      { $set: { images_status: plan.images_status === 'none' ? 'ready' : plan.images_status } },
    );
    // Attach ready urls onto items that are reusable
    await attachReadyImagesToItems(plan.reusable.map((r) => r.key));
    await refreshDeckImagesStatus(opts.deckId);
    return {
      ok: true,
      enqueued: 0,
      keys: [],
      reused: plan.reusable.length,
      estimate_usd: 0,
      images_status: 'ready',
    };
  }

  if (!opts.admin) {
    const used = await countImagesGeneratedToday();
    const limit = customDeckImageDailyLimit();
    if (used + toEnqueue.length > limit) {
      return {
        ok: false,
        reason: 'daily_cap',
        missing: toEnqueue.length,
        estimate_usd: plan.estimate_usd,
      };
    }
  } else if (!opts.confirmOverCap) {
    const used = await countImagesGeneratedToday();
    const limit = customDeckImageDailyLimit();
    if (used + toEnqueue.length > limit) {
      return {
        ok: false,
        reason: 'needs_confirm_over_cap',
        missing: toEnqueue.length,
        estimate_usd: plan.estimate_usd,
      };
    }
  }

  const usedBy = deckUsedById(opts.deckId);
  const quality = customDeckImageQuality();
  const model = customDeckImageModelId();
  const jobIds: string[] = [];
  const keys: string[] = [];

  for (const row of toEnqueue) {
    const spec = buildCustomDeckImageSpec({
      pos: row.pos,
      concept_en: row.concept_en,
      ar: row.ar,
      topic: plan.topic,
    });
    if (!spec) continue;

    // Clear characters so generateOne uses style-anchor only
    spec.characters = [];

    await V2ImageModel().findOneAndUpdate(
      { key: row.key },
      {
        $set: {
          status: 'queued',
          reason: null,
          spec,
          type: spec.type,
          kind: 'content',
        },
        $addToSet: { used_by: usedBy },
        $setOnInsert: {
          key: row.key,
          cost_usd: 0,
          version: 1,
        },
      },
      { upsert: true },
    );

    const job = await V2JobModel().create({
      kind: 'image',
      status: 'queued',
      lesson_id: `deck.${opts.deckId}`,
      day: 0,
      target_lang: 'pt-PT',
      version: 1,
      attempts: [],
      input: {
        key: row.key,
        item_id: row.item_id,
        deck_id: opts.deckId,
        source: 'custom_deck',
        manifest_source: 'word',
        aspect: '1:1',
        force: Boolean(opts.force),
        quality,
        model,
      },
    });
    jobIds.push(String(job._id));
    keys.push(row.key);
  }

  // Link ready reused keys immediately
  if (plan.reusable.length) {
    await attachReadyImagesToItems(plan.reusable.map((r) => r.key));
    await V2ImageModel().updateMany(
      { key: { $in: plan.reusable.map((r) => r.key) } },
      { $addToSet: { used_by: usedBy } },
    );
  }

  await V2CustomDeckModel().updateOne(
    { _id: opts.deckId },
    { $set: { images_status: keys.length ? 'queued' : plan.images_status } },
  );

  return {
    ok: true,
    enqueued: keys.length,
    keys,
    reused: plan.reusable.length,
    estimate_usd: plan.estimate_usd,
    images_status: keys.length ? 'queued' : 'ready',
  };
}

async function attachReadyImagesToItems(keys: string[]): Promise<void> {
  if (!keys.length) return;
  const docs = await V2ImageModel()
    .find({ key: { $in: keys }, status: 'ready', url: { $exists: true, $ne: '' } })
    .lean();
  for (const d of docs) {
    const concept = String(d.key).replace(/^word\./, '');
    await V2CustomItemModel().updateMany(
      { concept_en: concept },
      { $set: { image: { key: d.key, url: String(d.url) } } },
    );
  }
}

export async function refreshDeckImagesStatus(deckId: string): Promise<DeckImagesStatus> {
  const plan = await planDeckImages({ deckId });
  if (!plan) return 'none';
  let status: DeckImagesStatus = plan.images_status;
  if (plan.missing.length && plan.reusable.length) status = 'partial';
  else if (plan.missing.length && !plan.reusable.length) {
    // queued if any image docs are queued/generating
    const keys = plan.missing.map((m) => m.key);
    const active = await V2ImageModel().countDocuments({
      key: { $in: keys },
      status: { $in: ['queued', 'generating'] },
    });
    status = active > 0 ? 'queued' : plan.reusable.length ? 'partial' : 'none';
  } else if (!plan.missing.length && plan.reusable.length) status = 'ready';
  await V2CustomDeckModel().updateOne(
    { _id: deckId },
    { $set: { images_status: status } },
  );
  return status;
}

/** After add: enqueue if added_count crossed the threshold. */
export async function maybeEnqueueAfterAdd(opts: {
  deckId: string;
  added_count: number;
}): Promise<void> {
  if (opts.added_count < customDeckImageThreshold()) return;
  const deck = await V2CustomDeckModel().findById(opts.deckId).lean();
  if (!deck) return;
  if (deck.images_status === 'ready' || deck.images_status === 'queued') return;
  await enqueueCustomDeckImages({ deckId: opts.deckId, admin: false });
}

/**
 * Legacy official-deck enqueue (promote flow). Nouns/verbs/adjectives via concept_en.
 */
export async function enqueueDeckImages(
  officialDeckId: string,
): Promise<{ enqueued: number; keys: string[] }> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();

  const official = await V2OfficialDeckModel().findById(officialDeckId).lean();
  if (!official) throw new Error('official deck not found');

  const source = official.source_deck
    ? String(official.source_deck)
    : null;
  if (source) {
    const r = await enqueueCustomDeckImages({
      deckId: source,
      admin: true,
      confirmOverCap: true,
    });
    if (r.ok) return { enqueued: r.enqueued, keys: r.keys };
  }

  // Fallback: enqueue from official item ids' custom items directly
  const customIds = (official.item_ids ?? []).filter(isCustomItemId);
  const items = await V2CustomItemModel()
    .find({ id: { $in: customIds } })
    .lean();
  const keys: string[] = [];
  for (const item of items) {
    if (!posGetsImage(String(item.pos))) continue;
    const concept = item.concept_en
      ? String(item.concept_en)
      : null;
    if (!concept) continue;
    const key = imageKeyForConcept(concept);
    keys.push(key);
    const spec = buildCustomDeckImageSpec({
      pos: String(item.pos),
      concept_en: concept,
      ar: String(item.ar),
      topic: official.title_tl,
    });
    if (!spec) continue;
    spec.characters = [];
    await V2ImageModel().findOneAndUpdate(
      { key },
      {
        $set: { status: 'queued', spec, type: spec.type, kind: 'content' },
        $addToSet: { used_by: `official:${officialDeckId}` },
        $setOnInsert: { key, cost_usd: 0, version: 1 },
      },
      { upsert: true },
    );
    await V2JobModel().create({
      kind: 'image',
      status: 'queued',
      lesson_id: `official.${officialDeckId}`,
      day: 0,
      target_lang: official.target_lang,
      version: 1,
      attempts: [],
      input: {
        key,
        item_id: item.id,
        deck_id: officialDeckId,
        source: 'custom_deck',
        manifest_source: 'word',
        aspect: '1:1',
        force: false,
        quality: customDeckImageQuality(),
        model: customDeckImageModelId(),
      },
    });
  }
  return { enqueued: keys.length, keys };
}

/** Hide image after enough wrong_picture reports on the same key. */
export async function hideImageKey(key: string): Promise<void> {
  await V2ImageModel().updateOne(
    { key },
    { $set: { status: 'flagged', reason: 'wrong_picture reports' } },
  );
  const concept = key.replace(/^word\./, '');
  await V2CustomItemModel().updateMany(
    { concept_en: concept },
    { $unset: { image: 1 } },
  );
}
