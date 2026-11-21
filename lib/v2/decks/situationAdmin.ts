import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { flashcardItems } from '@/lib/v2/content/flashcards';
import type { Item } from '@/lib/v2/content/items';
import { loadPlan } from '@/lib/v2/generation/lesson/plan';
import {
  V2ImageModel,
  V2LessonModel,
  V2SituationCardBankModel,
} from '@/lib/v2/mongo/models';

export type AdminSituationDeck = {
  day: number;
  id: string;
  title_tl: string;
  title_ar: string;
  situation_eg: string;
  card_count: number;
  imageable_count: number;
  missing_images: number;
  images_status: 'none' | 'partial' | 'ready';
  /**
   * Where flashcard items come from.
   * `lesson` = latest unpublished lesson (draft/reviewed) used for admin visibility.
   */
  source: 'published' | 'bank' | 'lesson' | 'none';
  lesson_status: string | null;
  bank_status: string | null;
};

function itemsFromLessonData(data: unknown): Item[] {
  return flashcardItems(
    ((data as { items?: Item[] } | null)?.items ?? []) as Item[],
  );
}

/**
 * Curriculum situation decks (المواقف / standard) for the admin flashcards hub.
 * Image keys are lesson item ids (word/phrase), same as the lesson image pipeline.
 *
 * Card resolution per day: published lesson → ready bank → latest lesson any status.
 * Always returns every plan day, sorted day 1 ascending.
 */
export async function listAdminSituationDecks(
  targetLang = 'pt-PT',
): Promise<AdminSituationDeck[]> {
  const plan = loadPlan();
  const days = plan.days;
  const byDay = new Map<number, { items: Item[]; source: AdminSituationDeck['source'] }>();

  if (!mongoConfigured()) {
    return days
      .map((d) => ({
        day: d.day,
        id: `day:${d.day}`,
        title_tl: d.title_tl,
        title_ar: d.title_ar,
        situation_eg: d.situation_eg,
        card_count: 0,
        imageable_count: 0,
        missing_images: 0,
        images_status: 'none' as const,
        source: 'none' as const,
        lesson_status: null,
        bank_status: null,
      }))
      .sort((a, b) => a.day - b.day);
  }

  await connectMongo();

  const [publishedDocs, bankReadyDocs, latestLessonDocs, bankStatusDocs] =
    await Promise.all([
      V2LessonModel()
        .find({ target_lang: targetLang, status: 'published' })
        .sort({ day: 1, version: -1 })
        .select({ day: 1, status: 1, data: 1 })
        .lean(),
      V2SituationCardBankModel()
        .find({ target_lang: targetLang, status: 'ready' })
        .select({ day: 1, items: 1, status: 1 })
        .lean(),
      V2LessonModel()
        .find({ target_lang: targetLang })
        .sort({ day: 1, version: -1 })
        .select({ day: 1, status: 1, data: 1 })
        .lean(),
      V2SituationCardBankModel()
        .find({ target_lang: targetLang })
        .select({ day: 1, status: 1 })
        .lean(),
    ]);

  const publishedSeen = new Set<number>();
  for (const doc of publishedDocs) {
    const day = Number(doc.day);
    if (publishedSeen.has(day)) continue;
    publishedSeen.add(day);
    const items = itemsFromLessonData(doc.data);
    if (items.length) byDay.set(day, { items, source: 'published' });
  }

  for (const bank of bankReadyDocs) {
    const day = Number(bank.day);
    if (byDay.has(day)) continue;
    const items = flashcardItems((bank.items ?? []) as Item[]);
    if (items.length) byDay.set(day, { items, source: 'bank' });
  }

  const lessonByDay = new Map<number, string>();
  const latestSeen = new Set<number>();
  for (const doc of latestLessonDocs) {
    const day = Number(doc.day);
    const status = String(doc.status);
    const cur = lessonByDay.get(day);
    if (!cur) lessonByDay.set(day, status);
    else if (status === 'published') lessonByDay.set(day, 'published');

    if (latestSeen.has(day)) continue;
    latestSeen.add(day);
    if (byDay.has(day)) continue;
    const items = itemsFromLessonData(doc.data);
    if (items.length) byDay.set(day, { items, source: 'lesson' });
  }

  const bankByDay = new Map(
    bankStatusDocs.map((b) => [Number(b.day), String(b.status)]),
  );

  const dayKeys = new Map<number, string[]>();
  for (const d of days) {
    const items = byDay.get(d.day)?.items ?? [];
    dayKeys.set(
      d.day,
      items
        .filter((i) => i.type === 'word' || i.type === 'phrase')
        .map((i) => i.id),
    );
  }

  const allKeys = [...new Set([...dayKeys.values()].flat())];
  const readySet = new Set<string>();
  if (allKeys.length) {
    const readyDocs = await V2ImageModel()
      .find({ key: { $in: allKeys }, status: 'ready' })
      .select({ key: 1 })
      .lean();
    for (const row of readyDocs) readySet.add(String(row.key));
  }

  return days
    .map((d) => {
      const resolved = byDay.get(d.day);
      const items = resolved?.items ?? [];
      const source = resolved?.source ?? 'none';
      const keys = dayKeys.get(d.day) ?? [];
      const ready = keys.filter((k) => readySet.has(k)).length;
      const missing_images = Math.max(0, keys.length - ready);
      const images_status: AdminSituationDeck['images_status'] =
        keys.length === 0
          ? 'none'
          : missing_images === 0
            ? 'ready'
            : ready > 0
              ? 'partial'
              : 'none';
      return {
        day: d.day,
        id: `day:${d.day}`,
        title_tl: d.title_tl,
        title_ar: d.title_ar,
        situation_eg: d.situation_eg,
        card_count: items.length,
        imageable_count: keys.length,
        missing_images,
        images_status,
        source,
        lesson_status: lessonByDay.get(d.day) ?? null,
        bank_status: bankByDay.get(d.day) ?? null,
      };
    })
    .sort((a, b) => a.day - b.day);
}
