import { connectMongo, mongoConfigured } from '@/lib/mongo';
import type { Item } from '@/lib/v2/content/items';
import { loadKnownItemMap } from '@/lib/v2/generation/lesson/registry';
import { V2CustomItemModel } from '@/lib/v2/mongo/models';
import {
  customItemId,
  normaliseLemma,
  type CustomItemPos,
} from './keys';
import type { CustomItemFields, ResolvedItemRef } from './types';

function itemPos(item: Item): CustomItemPos | null {
  if (item.type === 'phrase') return 'phrase';
  if (item.type === 'word') {
    if (item.id.startsWith('verb.') || ('lemma' in item && item.lemma)) {
      // verb lemma cards are type word with verb.* id in some packs
      if (item.id.startsWith('verb.')) return 'verb';
    }
    const g = 'gender' in item ? item.gender : undefined;
    if (g === 'm' || g === 'f') return 'noun';
    return 'noun'; // default word → treat as noun for matching
  }
  return null;
}

function itemTl(item: Item): string {
  return 'tl' in item && typeof item.tl === 'string' ? item.tl : '';
}

/**
 * Find an official lesson/registry item id for a TL + POS.
 * Pure over a known-item map (tests inject maps; production loads the registry).
 */
export function findOfficialItemId(
  known: Map<string, Item>,
  tl: string,
  pos: CustomItemPos,
): string | null {
  const key = normaliseLemma(tl);
  if (!key) return null;

  for (const item of known.values()) {
    const tlRaw = itemTl(item);
    if (!tlRaw) continue;
    if (normaliseLemma(tlRaw) !== key) continue;
    const ip = itemPos(item);
    if (ip && ip !== pos) {
      // Allow noun↔word soft match; require exact for verb/phrase
      if (pos === 'verb' || pos === 'phrase' || ip === 'verb' || ip === 'phrase') {
        continue;
      }
    }
    if (pos === 'verb' && !item.id.startsWith('verb.') && item.type !== 'word') {
      continue;
    }
    return item.id;
  }

  // Also match verb lemma ids: verb.falar against tl "falar"
  if (pos === 'verb') {
    const guess = `verb.${key}`;
    if (known.has(guess)) return guess;
  }
  return null;
}

export async function loadOfficialItemMap(opts?: {
  day?: number;
  targetLang?: string;
}): Promise<Map<string, Item>> {
  return loadKnownItemMap({
    day: opts?.day ?? 999,
    targetLang: opts?.targetLang ?? 'pt-PT',
  });
}

export type ResolveCustomItemInput = {
  target_lang: string;
  tl: string;
  pos: CustomItemPos;
  tl_f?: string;
  gender?: 'm' | 'f' | 'n';
  ar: string;
  eg_note?: string;
  example_tl: string;
  example_ar: string;
  say: string;
  concept_en?: string;
  deck_id?: string;
  /** Inject known map (tests). */
  known?: Map<string, Item>;
  /** In-memory store for tests (skips Mongo). */
  memoryStore?: Map<string, CustomItemFields>;
};

/**
 * Resolve a generated word to an official item id or one shared custom item.
 * Same language × lemma × POS always yields the same custom id.
 */
export async function resolveOrCreateCustomItem(
  input: ResolveCustomItemInput,
): Promise<ResolvedItemRef> {
  const known = input.known ?? (await loadOfficialItemMap({
    targetLang: input.target_lang,
  }));
  const official = findOfficialItemId(known, input.tl, input.pos);
  if (official) {
    return { item_id: official, source: 'official', created: false };
  }

  const lemma = normaliseLemma(input.tl);
  const id = customItemId(input.target_lang, lemma, input.pos);

  if (input.memoryStore) {
    const existing = input.memoryStore.get(id);
    if (existing) {
      if (input.deck_id && !existing.deck_ids.includes(input.deck_id)) {
        existing.deck_ids.push(input.deck_id);
      }
      return { item_id: id, source: 'custom', created: false };
    }
    const doc: CustomItemFields = {
      id,
      target_lang: input.target_lang,
      lemma,
      pos: input.pos,
      tl: input.tl,
      tl_f: input.tl_f,
      gender: input.gender,
      ar: input.ar,
      eg_note: input.eg_note,
      example_tl: input.example_tl,
      example_ar: input.example_ar,
      say: input.say,
      concept_en: input.concept_en,
      status: 'custom',
      deck_ids: input.deck_id ? [input.deck_id] : [],
    };
    input.memoryStore.set(id, doc);
    return { item_id: id, source: 'custom', created: true };
  }

  if (!mongoConfigured()) {
    throw new Error('MongoDB not configured');
  }
  await connectMongo();
  const Model = V2CustomItemModel();
  const existing = await Model.findOne({ id }).lean();
  if (existing) {
    if (input.deck_id) {
      await Model.updateOne(
        { id },
        { $addToSet: { deck_ids: input.deck_id } },
      );
    }
    return { item_id: id, source: 'custom', created: false };
  }

  await Model.create({
    id,
    target_lang: input.target_lang,
    lemma,
    pos: input.pos,
    tl: input.tl,
    tl_f: input.tl_f,
    gender: input.gender,
    ar: input.ar,
    eg_note: input.eg_note,
    example_tl: input.example_tl,
    example_ar: input.example_ar,
    say: input.say,
    concept_en: input.concept_en,
    status: 'custom',
    deck_ids: input.deck_id ? [input.deck_id] : [],
  });
  return { item_id: id, source: 'custom', created: true };
}
