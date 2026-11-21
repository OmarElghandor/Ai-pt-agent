import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { flashcardItems } from '@/lib/v2/content/flashcards';
import type { Item } from '@/lib/v2/content/items';
import { buildLessonBrief } from '@/lib/v2/generation/lesson/brief';
import {
  selectKnownForDay,
  type DayDigest,
} from '@/lib/v2/generation/lesson/handoffs';
import { getDayPlan } from '@/lib/v2/generation/lesson/plan';
import { loadKnownItemMap } from '@/lib/v2/generation/lesson/registry';
import { runItemsJob } from '@/lib/v2/generation/lesson/jobs/runItems';
import { getLatestLesson } from '@/lib/v2/generation/lesson/save';
import {
  V2LessonModel,
  V2SituationCardBankModel,
} from '@/lib/v2/mongo/models';
import {
  enrichFlashcardExamples,
  itemsNeedingExampleEnrichment,
} from '@/lib/v2/decks/enrichExamples';

export type SituationBankResult =
  | {
      status: 'ready';
      items: Item[];
      source: 'published' | 'bank';
    }
  | {
      status: 'generating';
      items: Item[];
    }
  | {
      status: 'failed';
      items: Item[];
      message_eg: string;
    };

const FAIL_EG = 'ما قدرناش نجهّز كروت الموقف دلوقتي';
const POLL_MS = 1500;
const POLL_MAX = 35;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadYesterdayDigest(
  day: number,
  targetLang: string,
): Promise<DayDigest | null> {
  if (day <= 1) return null;
  const prev = await getLatestLesson(day - 1, targetLang);
  const handoffs = (
    prev?.meta as { handoffs?: Record<string, unknown> } | undefined
  )?.handoffs;
  const digest = handoffs?.assemble as DayDigest | undefined;
  return digest ?? null;
}

/** Published lesson flashcard items for one day (newest published version). */
export async function loadPublishedFlashcardsForDay(
  day: number,
  targetLang = 'pt-PT',
): Promise<Item[]> {
  if (!mongoConfigured()) return [];
  await connectMongo();
  const doc = await V2LessonModel()
    .findOne({
      target_lang: targetLang,
      status: 'published',
      day,
    })
    .sort({ version: -1 })
    .lean();
  if (!doc) return [];
  return flashcardItems(
    ((doc.data as { items?: Item[] })?.items ?? []) as Item[],
  );
}

/** Ready standalone bank items for one day. */
export async function loadReadyBankItems(
  day: number,
  targetLang = 'pt-PT',
): Promise<Item[]> {
  if (!mongoConfigured()) return [];
  await connectMongo();
  const doc = await V2SituationCardBankModel()
    .findOne({ day, target_lang: targetLang, status: 'ready' })
    .lean();
  if (!doc) return [];
  return flashcardItems((doc.items ?? []) as Item[]);
}

/**
 * Prefer published lesson items; else a ready standalone bank.
 * Does not generate.
 */
export async function getSituationCardItems(
  day: number,
  targetLang = 'pt-PT',
): Promise<Item[]> {
  const published = await loadPublishedFlashcardsForDay(day, targetLang);
  if (published.length > 0) return published;
  return loadReadyBankItems(day, targetLang);
}

/** All ready banks keyed by day (for listing). */
export async function loadAllReadyBanks(
  targetLang = 'pt-PT',
): Promise<Map<number, Item[]>> {
  const byDay = new Map<number, Item[]>();
  if (!mongoConfigured()) return byDay;
  await connectMongo();
  const docs = await V2SituationCardBankModel()
    .find({ target_lang: targetLang, status: 'ready' })
    .lean();
  for (const doc of docs) {
    const items = flashcardItems((doc.items ?? []) as Item[]);
    if (items.length) byDay.set(doc.day, items);
  }
  return byDay;
}

async function generateItemsForDay(
  day: number,
  targetLang: string,
): Promise<Item[]> {
  const yesterday = await loadYesterdayDigest(day, targetLang);
  const brief = buildLessonBrief(getDayPlan(day), { yesterday });
  const knownFull = await loadKnownItemMap({ day, targetLang });
  const pool = [...knownFull.values()]
    .map((it) => ({
      id: it.id,
      type: it.type,
      tl: 'tl' in it && typeof it.tl === 'string' ? it.tl : '',
    }))
    .filter((r) => r.tl);
  const known = selectKnownForDay({
    pool,
    coreWords: brief.core_items_tl,
    earlyChunks: brief.early_chunks_tl,
    recycleIds: brief.recycle_ids,
  });
  const result = await runItemsJob({ brief, known, knownFull });
  if (result.fatals?.length) {
    throw new Error(
      result.fatals.map((f) => `${f.rule}: ${f.message}`).join('; '),
    );
  }
  if (!result.items.length) {
    throw new Error('items_empty');
  }
  return result.items;
}

async function pollUntilSettled(
  day: number,
  targetLang: string,
): Promise<SituationBankResult> {
  for (let i = 0; i < POLL_MAX; i += 1) {
    await sleep(POLL_MS);
    const doc = await V2SituationCardBankModel()
      .findOne({ day, target_lang: targetLang })
      .lean();
    if (!doc) continue;
    if (doc.status === 'ready') {
      return {
        status: 'ready',
        items: flashcardItems((doc.items ?? []) as Item[]),
        source: 'bank',
      };
    }
    if (doc.status === 'failed') {
      return {
        status: 'failed',
        items: [],
        message_eg: doc.error?.trim() || FAIL_EG,
      };
    }
  }
  return { status: 'generating', items: [] };
}

/**
 * Idempotent by default: published wins; else ready bank; else generate items-only bank.
 * With `force: true` (admin): skip published/ready short-circuits and overwrite the bank.
 * Never writes v2_lessons.
 */
export async function ensureSituationCardBank(opts: {
  day: number;
  targetLang?: string;
  force?: boolean;
}): Promise<SituationBankResult> {
  const targetLang = opts.targetLang ?? 'pt-PT';
  const day = opts.day;
  const force = Boolean(opts.force);
  if (!Number.isFinite(day) || day < 1) {
    return { status: 'failed', items: [], message_eg: FAIL_EG };
  }
  if (!mongoConfigured()) {
    return { status: 'failed', items: [], message_eg: FAIL_EG };
  }
  await connectMongo();

  if (!force) {
    const published = await loadPublishedFlashcardsForDay(day, targetLang);
    if (published.length > 0) {
      return { status: 'ready', items: published, source: 'published' };
    }
  }

  const Model = V2SituationCardBankModel();
  let doc = await Model.findOne({ day, target_lang: targetLang }).lean();

  if (!force && doc?.status === 'ready') {
    const rawItems = ((doc.items ?? []) as Item[]) ?? [];
    const cards = flashcardItems(rawItems);
    if (cards.length > 0) {
      // Backfill example sentences for banks generated before enrichment.
      if (itemsNeedingExampleEnrichment(rawItems).length > 0) {
        const enriched = await enrichFlashcardExamples(rawItems);
        await Model.updateOne(
          { day, target_lang: targetLang, status: 'ready' },
          { $set: { items: enriched } },
        );
        return {
          status: 'ready',
          items: flashcardItems(enriched),
          source: 'bank',
        };
      }
      return { status: 'ready', items: cards, source: 'bank' };
    }
  }

  if (!force && doc?.status === 'generating') {
    return pollUntilSettled(day, targetLang);
  }

  // Claim: create or flip to generating (force may overwrite ready/failed)
  if (!doc) {
    try {
      await Model.create({
        day,
        target_lang: targetLang,
        status: 'generating',
        items: [],
      });
    } catch {
      // Unique race — another request claimed
      return pollUntilSettled(day, targetLang);
    }
  } else if (force) {
    if (doc.status === 'generating') {
      return pollUntilSettled(day, targetLang);
    }
    const claimed = await Model.findOneAndUpdate(
      {
        day,
        target_lang: targetLang,
        status: { $in: ['ready', 'failed'] },
      },
      { $set: { status: 'generating', items: [], error: null } },
      { new: true },
    ).lean();
    if (!claimed) {
      return pollUntilSettled(day, targetLang);
    }
  } else {
    const claimed = await Model.findOneAndUpdate(
      { day, target_lang: targetLang, status: 'failed' },
      { $set: { status: 'generating', items: [], error: null } },
      { new: true },
    ).lean();
    if (!claimed) {
      return pollUntilSettled(day, targetLang);
    }
  }

  try {
    const generated = await generateItemsForDay(day, targetLang);
    const items = await enrichFlashcardExamples(generated);
    await Model.updateOne(
      { day, target_lang: targetLang },
      { $set: { status: 'ready', items, error: null } },
    );
    const cards = flashcardItems(items);
    if (!cards.length) {
      await Model.updateOne(
        { day, target_lang: targetLang },
        { $set: { status: 'failed', error: 'no_flashcards', items: [] } },
      );
      return { status: 'failed', items: [], message_eg: FAIL_EG };
    }
    return { status: 'ready', items: cards, source: 'bank' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await Model.updateOne(
      { day, target_lang: targetLang },
      { $set: { status: 'failed', error: message.slice(0, 500), items: [] } },
    );
    return { status: 'failed', items: [], message_eg: FAIL_EG };
  }
}
