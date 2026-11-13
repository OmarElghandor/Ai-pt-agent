import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  V2CustomDeckModel,
  V2CustomItemModel,
  V2ItemStateModel,
  V2OfficialDeckModel,
  V2UserDeckModel,
} from '@/lib/v2/mongo/models';
import type { ItemState } from '@/lib/v2/progress';
import { createItemState } from '@/lib/v2/progress/srs';
import { hydrateCardFaces, type CardFacePayload } from './curriculum';
import { isCustomItemId } from './keys';

export const CUSTOM_DECK_NEW_PER_DAY = 10;

export type CustomDeckSessionCard = {
  item_id: string;
  kind: 'due' | 'new';
  face: CardFacePayload | null;
};

export type CustomDeckSession = {
  deck_id: string;
  deck_kind: 'custom' | 'official';
  title_tl: string;
  title_ar: string;
  local_date: string;
  cards: CustomDeckSessionCard[];
  /** TODO(P11): finishing ≥10 ratings should count for streak when P11 lands. */
  ratings_for_streak_threshold: 10;
};

function parseDeckRef(raw: string): {
  kind: 'custom' | 'official';
  id: string;
} | null {
  if (raw.startsWith('custom:')) {
    return { kind: 'custom', id: raw.slice('custom:'.length) };
  }
  if (raw.startsWith('official:')) {
    return { kind: 'official', id: raw.slice('official:'.length) };
  }
  // bare ObjectId from older links
  if (/^[a-f0-9]{24}$/i.test(raw)) {
    return { kind: 'custom', id: raw };
  }
  return null;
}

function docToState(doc: Record<string, unknown>): ItemState {
  const card = (doc.card ?? {}) as Record<string, unknown>;
  return {
    user_id: String(doc.user_id),
    item_id: String(doc.item_id),
    target_lang: String(doc.target_lang ?? 'pt-PT'),
    introducedDay: Number(doc.introducedDay ?? 1),
    usedCorrectlyIn: Array.isArray(doc.usedCorrectlyIn)
      ? (doc.usedCorrectlyIn as string[])
      : [],
    levels: {
      heard: 0,
      understood: 0,
      said: 0,
      used: 0,
    },
    skills: {},
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
    lastImplicitReviewLocalDate: null,
    weakToolIds: [],
    opt_in_card: true,
  };
}

/**
 * Build a per-deck review queue: due first, then up to 10 new / local day.
 * TODO(P9): ensure these item ids never enter the curriculum daily deck builder.
 */
export async function buildCustomDeckSession(opts: {
  user_id: string;
  deckRef: string;
  local_date: string;
  now?: Date;
}): Promise<CustomDeckSession | null> {
  const parsed = parseDeckRef(opts.deckRef);
  if (!parsed) return null;
  if (!mongoConfigured()) return null;
  await connectMongo();

  let title_tl = '';
  let title_ar = '';
  let item_ids: string[] = [];

  if (parsed.kind === 'custom') {
    const deck = await V2CustomDeckModel().findById(parsed.id).lean();
    if (!deck) return null;
    title_tl = deck.title_tl;
    title_ar = deck.title_ar;
    item_ids = deck.item_ids ?? [];
  } else {
    const deck = await V2OfficialDeckModel().findById(parsed.id).lean();
    if (!deck || deck.status !== 'published') return null;
    title_tl = deck.title_tl;
    title_ar = deck.title_ar;
    item_ids = deck.item_ids ?? [];
  }

  const states = await V2ItemStateModel()
    .find({ user_id: opts.user_id, item_id: { $in: item_ids } })
    .lean();
  const stateById = new Map(
    states.map((d) => [
      String(d.item_id),
      docToState(d as unknown as Record<string, unknown>),
    ]),
  );

  const now = opts.now ?? new Date();
  const due: string[] = [];
  const unseen: string[] = [];
  for (const id of item_ids) {
    const st = stateById.get(id);
    if (!st) {
      unseen.push(id);
      continue;
    }
    if (st.card.masteryLevel === 'mastered' && !st.card.knowCheckDueAt) {
      continue;
    }
    if (st.card.dueAt && new Date(st.card.dueAt) <= now) {
      due.push(id);
    } else if (!st.card.dueAt) {
      // Seen but never scheduled — treat as still new/due for this deck
      due.push(id);
    }
  }

  const userDeck = await V2UserDeckModel()
    .findOne({ user_id: opts.user_id, deck_id: parsed.id })
    .lean();
  const byDay =
    (userDeck?.new_cards_by_day as Record<string, number> | undefined) ?? {};
  const alreadyNew = Number(byDay[opts.local_date] ?? 0);
  const newSlots = Math.max(0, CUSTOM_DECK_NEW_PER_DAY - alreadyNew);
  const newIds = unseen.slice(0, newSlots);

  // Ensure item state exists for new cards (introduced) without writing SRS ratings here.
  for (const id of newIds) {
    if (stateById.has(id)) continue;
    const blank = createItemState({
      user_id: opts.user_id,
      item_id: id,
      target_lang: 'pt-PT',
      introducedDay: 1,
    });
    blank.opt_in_card = true;
    await V2ItemStateModel().updateOne(
      { user_id: opts.user_id, item_id: id },
      { $setOnInsert: blank },
      { upsert: true },
    );
  }

  if (newIds.length > 0) {
    await V2UserDeckModel().updateOne(
      { user_id: opts.user_id, deck_id: parsed.id },
      {
        $setOnInsert: {
          user_id: opts.user_id,
          deck_id: parsed.id,
          deck_kind: parsed.kind,
          added_at: new Date(),
        },
        $inc: { [`new_cards_by_day.${opts.local_date}`]: newIds.length },
      },
      { upsert: true },
    );
  }

  const ordered = [...due, ...newIds.filter((id) => !due.includes(id))];
  const faces = await hydrateCustomFaces(ordered);

  return {
    deck_id: `${parsed.kind}:${parsed.id}`,
    deck_kind: parsed.kind,
    title_tl,
    title_ar,
    local_date: opts.local_date,
    cards: ordered.map((item_id) => ({
      item_id,
      kind: due.includes(item_id) ? 'due' : 'new',
      face: faces.get(item_id) ?? null,
    })),
    ratings_for_streak_threshold: 10,
  };
}

async function hydrateCustomFaces(
  ids: string[],
): Promise<Map<string, CardFacePayload>> {
  const map = new Map<string, CardFacePayload>();
  const customIds = ids.filter(isCustomItemId);
  const officialIds = ids.filter((id) => !isCustomItemId(id));

  if (officialIds.length > 0) {
    const fromLessons = await hydrateCardFaces(officialIds, 999);
    for (const [k, v] of fromLessons) map.set(k, v);
  }

  if (customIds.length > 0) {
    const docs = await V2CustomItemModel()
      .find({ id: { $in: customIds } })
      .lean();
    for (const d of docs) {
      const imageUrl =
        d.image &&
        typeof d.image === 'object' &&
        'url' in d.image &&
        typeof (d.image as { url?: unknown }).url === 'string'
          ? String((d.image as { url: string }).url)
          : undefined;
      map.set(d.id, {
        item_id: d.id,
        kind: d.pos === 'phrase' ? 'phrase' : 'word',
        tl: d.tl,
        ar: d.ar,
        gender: d.gender ?? undefined,
        example: d.example_tl,
        example_ar: d.example_ar || undefined,
        image_url: imageUrl,
        /** Sentence-only hint for "محتاج تلميح؟" (same as curriculum cards). */
        hint_tl: d.example_tl || undefined,
        context_eg: d.eg_note ?? undefined,
      });
    }
  }
  return map;
}

/**
 * Pure helper for tests: pick due then new with a daily new cap.
 * Matches buildCustomDeckSession: existing state with dueAt null → due (uncapped).
 */
export function pickSessionQueue(opts: {
  item_ids: string[];
  states: Map<string, { dueAt: string | null; mastered: boolean }>;
  alreadyNewToday: number;
  now: Date;
  newCap?: number;
}): { due: string[]; neu: string[] } {
  const cap = opts.newCap ?? CUSTOM_DECK_NEW_PER_DAY;
  const due: string[] = [];
  const neu: string[] = [];
  for (const id of opts.item_ids) {
    const st = opts.states.get(id);
    if (!st) {
      neu.push(id);
      continue;
    }
    if (st.mastered) continue;
    if (st.dueAt && new Date(st.dueAt) <= opts.now) due.push(id);
    else if (!st.dueAt) {
      // Seen but never scheduled / post-reset blank — uncapped due path
      due.push(id);
    }
  }
  const slots = Math.max(0, cap - opts.alreadyNewToday);
  return { due, neu: neu.slice(0, slots) };
}

/**
 * Simulate post-reset states: every item gets a blank card (dueAt null).
 * Used by tests to prove a full deck re-enters the uncapped due queue.
 */
export function blankStatesAfterReset(
  item_ids: string[],
): Map<string, { dueAt: string | null; mastered: boolean }> {
  return new Map(
    item_ids.map((id) => [id, { dueAt: null, mastered: false }]),
  );
}
