import { connectMongo, mongoConfigured } from '@/lib/mongo';
import type { Item } from '@/lib/v2/content/items';
import { V2ItemModel, V2LessonModel } from '@/lib/v2/mongo/models';
import {
  coreItemAsKnownStub,
  coreItemsThroughDay,
} from './coreItems';
import type { KnownIdTl } from './hash';
import { itemIdTypeTl } from './hash';

/**
 * KNOWN = core file (days ≤ today) ∪ registry ∪ prior drafts.
 * Registry wins on id conflict. Core fills gaps so recycle works without day 1.
 */
export async function loadKnownItemMap(opts: {
  day: number;
  targetLang?: string;
}): Promise<Map<string, Item>> {
  const map = new Map<string, Item>();

  // Core file first (lowest priority — overwritten by drafts/registry)
  for (const c of coreItemsThroughDay(opts.day)) {
    const stub = coreItemAsKnownStub(c);
    map.set(c.id, {
      type: stub.type as Item['type'],
      id: stub.id,
      tl: stub.tl,
      // Never copy eg (Egyptian hint) into ar (MSA meaning).
      ar: '',
    } as Item);
  }

  if (!mongoConfigured()) return map;
  await connectMongo();
  const target_lang = opts.targetLang ?? 'pt-PT';

  const earlier = await V2LessonModel()
    .find({
      target_lang,
      day: { $lt: opts.day },
      status: { $in: ['draft', 'reviewed', 'published'] },
    })
    .sort({ day: 1, version: -1 })
    .lean();

  const seenDay = new Set<number>();
  for (const doc of earlier) {
    if (seenDay.has(doc.day)) continue;
    seenDay.add(doc.day);
    const items = (doc.data as { items?: unknown[] })?.items;
    if (!Array.isArray(items)) continue;
    for (const raw of items) {
      const item = raw as Item;
      if (item?.id) map.set(item.id, item);
    }
  }

  const registry = await V2ItemModel().find({ target_lang }).lean();
  for (const doc of registry) {
    const payload = doc.payload as Item | undefined;
    if (payload?.id) {
      map.set(doc.id, payload);
    } else {
      map.set(doc.id, {
        type: doc.type as Item['type'],
        id: doc.id,
        tl: doc.tl,
        ar: '',
      } as Item);
    }
  }

  return map;
}

/**
 * KNOWN = registry ∪ items from draft/reviewed lessons with day < current.
 * Registry wins on id conflict.
 */
export async function loadKnownItems(opts: {
  day: number;
  targetLang?: string;
}): Promise<KnownIdTl[]> {
  const full = await loadKnownItemMap(opts);
  const out: KnownIdTl[] = [];
  for (const item of full.values()) {
    const row = itemIdTypeTl(
      item as { id?: string; type?: string; tl?: string },
    );
    if (row) out.push(row);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export function checkTlCollisions(
  newItems: Item[],
  known: KnownIdTl[],
): string[] {
  const knownMap = new Map(known.map((k) => [k.id, k]));
  const errors: string[] = [];
  for (const item of newItems) {
    const row = itemIdTypeTl(item as { id?: string; type?: string; tl?: string });
    if (!row) continue;
    const prev = knownMap.get(row.id);
    if (!prev) continue;
    if (prev.tl !== row.tl) {
      errors.push(
        `id ${row.id} collides with known tl "${prev.tl}" vs new "${row.tl}"`,
      );
    }
  }
  return errors;
}

/** Write new items into registry on publish. Fails on tl conflict. */
export async function publishItemsToRegistry(opts: {
  day: number;
  targetLang?: string;
  items: Item[];
}): Promise<{ written: number; conflicts: string[] }> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const target_lang = opts.targetLang ?? 'pt-PT';
  const conflicts: string[] = [];
  let written = 0;

  for (const item of opts.items) {
    const row = itemIdTypeTl(item as { id?: string; type?: string; tl?: string });
    if (!row) continue;
    const existing = await V2ItemModel().findOne({
      target_lang,
      id: row.id,
    });
    if (existing) {
      if (existing.tl !== row.tl) {
        conflicts.push(
          `registry ${row.id}: existing tl "${existing.tl}" vs "${row.tl}"`,
        );
      }
      continue;
    }
    await V2ItemModel().create({
      target_lang,
      id: row.id,
      type: row.type,
      tl: row.tl,
      payload: item,
      first_day: opts.day,
    });
    written += 1;
  }

  return { written, conflicts };
}
