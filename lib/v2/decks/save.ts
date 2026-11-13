import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  V2CustomDeckJobModel,
  V2CustomDeckModel,
  V2UserDeckModel,
} from '@/lib/v2/mongo/models';
import { resolveOrCreateCustomItem } from './items';
import type { CheckedWord } from './generate/checks';
import type { CustomItemPos } from './keys';

export type SaveDraftInput = {
  user_id: string;
  draft_id: string;
  /** Preview keys (lemma or tl) the learner removed. */
  removed_keys?: string[];
};

export type SaveDraftResult =
  | {
      ok: true;
      deck_id: string;
      item_ids: string[];
      word_count: number;
    }
  | {
      ok: false;
      reason: 'not_found' | 'too_few' | 'unauthorized' | 'mongo';
      message_eg: string;
    };

type PreviewWord = CheckedWord & { key?: string };

function wordKey(w: PreviewWord): string {
  return (w.key ?? w.lemma ?? w.tl).toLowerCase();
}

/** Pure preview filter for tests / save gate. */
export function filterPreviewWords(
  words: PreviewWord[],
  removed_keys: string[] = [],
): PreviewWord[] {
  const removed = new Set(removed_keys.map((k) => k.toLowerCase()));
  return words.filter((w) => !removed.has(wordKey(w)));
}

export async function saveCustomDeckDraft(
  input: SaveDraftInput,
): Promise<SaveDraftResult> {
  if (!mongoConfigured()) {
    return {
      ok: false,
      reason: 'mongo',
      message_eg: 'الخدمة مش جاهزة دلوقتي',
    };
  }
  await connectMongo();

  const job = await V2CustomDeckJobModel().findById(input.draft_id).lean();
  if (!job || job.status !== 'done' || !job.preview) {
    return {
      ok: false,
      reason: 'not_found',
      message_eg: 'ما لقيناش المسودة دي',
    };
  }
  if (job.user_id !== input.user_id) {
    return {
      ok: false,
      reason: 'unauthorized',
      message_eg: 'مش مسموح',
    };
  }

  const preview = job.preview as {
    title_tl: string;
    title_ar: string;
    tags: string[];
    topic: string;
    target_lang: string;
    words: PreviewWord[];
  };

  const removed = new Set(
    (input.removed_keys ?? []).map((k) => k.toLowerCase()),
  );
  const remaining = preview.words.filter((w) => !removed.has(wordKey(w)));
  if (remaining.length < 15) {
    return {
      ok: false,
      reason: 'too_few',
      message_eg: 'لازم يبقى ١٥ كلمة على الأقل عشان نحفظ الديك',
    };
  }

  const deck = await V2CustomDeckModel().create({
    target_lang: preview.target_lang || 'pt-PT',
    title_tl: preview.title_tl,
    title_ar: preview.title_ar,
    tags: preview.tags ?? [],
    item_ids: [],
    topic: preview.topic,
    created_by: input.user_id,
    visibility: 'public',
    report_count: 0,
    added_count: 1,
    images_status: 'none',
    status: 'custom',
    generation_cost: job.cost ?? undefined,
  });
  const deckId = String(deck._id);

  const item_ids: string[] = [];
  for (const w of remaining) {
    const ref = await resolveOrCreateCustomItem({
      target_lang: preview.target_lang || 'pt-PT',
      tl: w.tl,
      pos: w.pos as CustomItemPos,
      tl_f: w.tl_f,
      gender: w.gender,
      ar: w.ar,
      eg_note: w.eg_note,
      example_tl: w.example_tl,
      example_ar: w.example_ar,
      say: w.say,
      concept_en: w.concept_en,
      deck_id: deckId,
    });
    item_ids.push(ref.item_id);
  }

  await V2CustomDeckModel().updateOne(
    { _id: deck._id },
    { $set: { item_ids } },
  );

  await V2UserDeckModel().updateOne(
    { user_id: input.user_id, deck_id: deckId },
    {
      $setOnInsert: {
        user_id: input.user_id,
        deck_id: deckId,
        deck_kind: 'custom',
        added_at: new Date(),
        new_cards_by_day: {},
      },
    },
    { upsert: true },
  );

  return {
    ok: true,
    deck_id: deckId,
    item_ids,
    word_count: item_ids.length,
  };
}
