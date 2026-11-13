import { connectMongo, mongoConfigured } from '@/lib/mongo';
import type { LessonPack } from '@/lib/v2/content/lesson';
import type { StoryDoc } from '@/lib/v2/content/story';
import { V2ImageModel } from '@/lib/v2/mongo/models';
import { storySceneKey } from './keys';
import type { ImageLink } from './types';

function lessonUsedById(day: number, targetLang: string, version: number): string {
  return `lesson:${targetLang}.day-${String(day).padStart(2, '0')}.v${version}`;
}

function storyUsedById(storyId: string, version: number): string {
  return `story:${storyId}.v${version}`;
}

async function readyMap(keys: string[]): Promise<Map<string, ImageLink>> {
  const unique = [...new Set(keys.filter(Boolean))];
  if (!unique.length) return new Map();
  await connectMongo();
  const docs = await V2ImageModel()
    .find({ key: { $in: unique }, status: 'ready', url: { $exists: true, $ne: '' } })
    .select({ key: 1, url: 1 })
    .lean();
  const map = new Map<string, ImageLink>();
  for (const d of docs) {
    if (d.key && d.url) map.set(d.key, { key: d.key, url: String(d.url) });
  }
  return map;
}

async function addUsedBy(keys: string[], usedBy: string): Promise<void> {
  if (!keys.length) return;
  await connectMongo();
  await V2ImageModel().updateMany(
    { key: { $in: keys } },
    { $addToSet: { used_by: usedBy } },
  );
}

/**
 * Fill items[].image from ready v2_images and register used_by.
 * Keys come from existing item.image.key, media.image, or the item id for
 * carded words/phrases/forms (same as the image manifest).
 */
export async function rehydrateLessonImages(opts: {
  day: number;
  targetLang?: string;
  version: number;
  pack: LessonPack;
}): Promise<LessonPack> {
  if (!mongoConfigured()) return opts.pack;
  const targetLang = opts.targetLang ?? 'pt-PT';
  const usedBy = lessonUsedById(opts.day, targetLang, opts.version);
  const items = opts.pack.items ?? [];
  const keys: string[] = [];

  for (const item of items) {
    const any = item as {
      id: string;
      type?: string;
      has_card?: boolean;
      image?: { key?: string };
      media?: { image?: string };
    };
    if (any.image?.key) keys.push(any.image.key);
    if (typeof any.media?.image === 'string' && any.media.image) {
      keys.push(any.media.image);
    }
    // Manifest keys words/phrases (and carded forms) by item.id
    if (
      any.has_card !== false &&
      (any.type === 'word' || any.type === 'phrase' || any.type === 'form')
    ) {
      keys.push(any.id);
    }
  }

  const map = await readyMap(keys);
  if (!map.size) return opts.pack;

  const nextItems = items.map((item) => {
    const any = item as {
      id: string;
      type?: string;
      has_card?: boolean;
      image?: ImageLink;
      media?: { image?: string };
    };
    const idKey =
      any.has_card !== false &&
      (any.type === 'word' || any.type === 'phrase' || any.type === 'form')
        ? any.id
        : undefined;
    const candidates = [
      any.image?.key,
      typeof any.media?.image === 'string' ? any.media.image : undefined,
      idKey,
    ].filter(Boolean) as string[];
    for (const k of candidates) {
      const link = map.get(k);
      if (link) return { ...item, image: link };
    }
    return item;
  });

  await addUsedBy([...map.keys()], usedBy);
  return { ...opts.pack, items: nextItems };
}

/**
 * Fill story.image from the ready cover scene key.
 */
export async function rehydrateStoryImages(story: StoryDoc): Promise<StoryDoc> {
  if (!mongoConfigured()) return story;
  const key =
    (story as { image?: ImageLink }).image?.key ??
    storySceneKey(story.day, story.target_lang);
  const map = await readyMap([key]);
  const link = map.get(key);
  if (!link) return story;
  await addUsedBy([key], storyUsedById(story.id, story.version));
  return { ...story, image: link } as StoryDoc;
}

/**
 * After an image becomes ready, write {key,url} onto every lesson/story in used_by
 * and any explicitly provided targets.
 */
export async function denormalizeReadyImage(opts: {
  key: string;
  url: string;
  extraUsedBy?: string[];
}): Promise<void> {
  if (!mongoConfigured()) return;
  await connectMongo();
  const Model = V2ImageModel();
  const doc = await Model.findOne({ key: opts.key }).lean();
  const usedBy = [
    ...new Set([...(doc?.used_by ?? []), ...(opts.extraUsedBy ?? [])]),
  ];
  if (!usedBy.length) return;

  const { V2LessonModel, V2StoryModel } = await import('@/lib/v2/mongo/models');
  const link: ImageLink = { key: opts.key, url: opts.url };

  for (const ref of usedBy) {
    if (ref.startsWith('lesson:')) {
      // lesson:pt-PT.day-01.v3
      const m = /^lesson:([^.]+)\.day-(\d+)\.v(\d+)$/.exec(ref);
      if (!m) continue;
      const target_lang = m[1];
      const day = Number(m[2]);
      const version = Number(m[3]);
      const lesson = await V2LessonModel()
        .findOne({ day, target_lang, version })
        .lean();
      if (!lesson?.data) continue;
      const data = lesson.data as LessonPack;
      const items = (data.items ?? []).map((item) => {
        const any = item as {
          id: string;
          image?: ImageLink;
          media?: { image?: string };
        };
        const matches =
          any.image?.key === opts.key ||
          any.media?.image === opts.key ||
          any.id === opts.key;
        return matches ? { ...item, image: link } : item;
      });
      await V2LessonModel().updateOne(
        { day, target_lang, version },
        { $set: { data: { ...data, items } } },
      );
    } else if (ref.startsWith('story:')) {
      // story:pt-PT.day-01.v3
      const m = /^story:(.+)\.v(\d+)$/.exec(ref);
      if (!m) continue;
      const id = m[1];
      const version = Number(m[2]);
      await V2StoryModel().updateOne(
        { id, version },
        { $set: { image: link } },
      );
    } else if (ref.startsWith('deck:') || ref.startsWith('official:')) {
      const { V2CustomItemModel, V2CustomDeckModel } = await import(
        '@/lib/v2/mongo/models'
      );
      const concept = opts.key.replace(/^word\./, '');
      await V2CustomItemModel().updateMany(
        {
          $or: [
            { concept_en: concept },
            { 'image.key': opts.key },
          ],
        },
        { $set: { image: link } },
      );
      if (ref.startsWith('deck:')) {
        const deckId = ref.slice('deck:'.length);
        try {
          const { refreshDeckImagesStatus } = await import(
            '@/lib/v2/decks/images'
          );
          await refreshDeckImagesStatus(deckId);
        } catch {
          await V2CustomDeckModel().updateOne(
            { _id: deckId },
            { $set: { images_status: 'partial' } },
          );
        }
      }
    }
  }
}
