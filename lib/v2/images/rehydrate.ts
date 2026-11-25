import { connectMongo, mongoConfigured } from '@/lib/mongo';
import type { LessonPack } from '@/lib/v2/content/lesson';
import type { StoryDoc } from '@/lib/v2/content/story';
import { V2ImageModel } from '@/lib/v2/mongo/models';
import { storySceneKey } from './keys';
import { isRealWorldImageItem } from './manifest';
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
  // Flagged still has a usable URL (generateOne denormalizes it); include both.
  const docs = await V2ImageModel()
    .find({
      key: { $in: unique },
      status: { $in: ['ready', 'flagged'] },
      url: { $exists: true, $ne: '' },
    })
    .select({ key: 1, url: 1, status: 1 })
    .lean();
  const map = new Map<string, ImageLink>();
  for (const d of docs) {
    if (d.key && d.url) map.set(d.key, { key: d.key, url: String(d.url) });
  }
  return map;
}

function itemMatchesImageKey(
  item: { id: string; image?: ImageLink; media?: { image?: string } },
  key: string,
): boolean {
  return (
    item.image?.key === key ||
    item.media?.image === key ||
    item.id === key
  );
}

async function patchLessonItemsWithImage(opts: {
  day: number;
  target_lang: string;
  version: number;
  key: string;
  link: ImageLink;
}): Promise<void> {
  const { V2LessonModel } = await import('@/lib/v2/mongo/models');
  const lesson = await V2LessonModel()
    .findOne({
      day: opts.day,
      target_lang: opts.target_lang,
      version: opts.version,
    })
    .lean();
  if (!lesson?.data) return;
  const data = lesson.data as LessonPack;
  let changed = false;
  const items = (data.items ?? []).map((item) => {
    const any = item as {
      id: string;
      image?: ImageLink;
      media?: { image?: string };
    };
    if (!itemMatchesImageKey(any, opts.key)) return item;
    changed = true;
    return { ...item, image: opts.link };
  });
  if (!changed) return;
  await V2LessonModel().updateOne(
    {
      day: opts.day,
      target_lang: opts.target_lang,
      version: opts.version,
    },
    { $set: { data: { ...data, items } } },
  );
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
      real_world?: boolean;
      image?: { key?: string };
      media?: { image?: string };
    };
    if (any.image?.key) keys.push(any.image.key);
    if (typeof any.media?.image === 'string' && any.media.image) {
      keys.push(any.media.image);
    }
    // Manifest keys words/phrases (and carded forms) by item.id;
    // RW phrases are included even with has_card:false.
    const cardedOrRw =
      any.has_card !== false || isRealWorldImageItem(any);
    if (
      cardedOrRw &&
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
      real_world?: boolean;
      image?: ImageLink;
      media?: { image?: string };
    };
    const cardedOrRw =
      any.has_card !== false || isRealWorldImageItem(any);
    const idKey =
      cardedOrRw &&
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

  const patchedLessonVersions = new Set<string>();

  for (const ref of usedBy) {
    if (ref.startsWith('lesson:')) {
      // lesson:pt-PT.day-01.v3
      const m = /^lesson:([^.]+)\.day-(\d+)\.v(\d+)$/.exec(ref);
      if (!m) continue;
      const target_lang = m[1]!;
      const day = Number(m[2]);
      const version = Number(m[3]);
      const versionKey = `${target_lang}:${day}:${version}`;
      if (!patchedLessonVersions.has(versionKey)) {
        await patchLessonItemsWithImage({
          day,
          target_lang,
          version,
          key: opts.key,
          link,
        });
        patchedLessonVersions.add(versionKey);
      }

      // Also patch other versions of the same day (esp. published) that
      // still need this item's image URL.
      const siblings = await V2LessonModel()
        .find({ day, target_lang, version: { $ne: version } })
        .select({ version: 1, status: 1, data: 1 })
        .lean();
      for (const sibling of siblings) {
        const sibVersion = Number(sibling.version);
        const sibKey = `${target_lang}:${day}:${sibVersion}`;
        if (patchedLessonVersions.has(sibKey)) continue;
        const data = sibling.data as LessonPack | undefined;
        const hasMatch = (data?.items ?? []).some((item) =>
          itemMatchesImageKey(
            item as {
              id: string;
              image?: ImageLink;
              media?: { image?: string };
            },
            opts.key,
          ),
        );
        if (!hasMatch) continue;
        await patchLessonItemsWithImage({
          day,
          target_lang,
          version: sibVersion,
          key: opts.key,
          link,
        });
        patchedLessonVersions.add(sibKey);
      }
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
