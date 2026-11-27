import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2ImageModel, V2JobModel } from '@/lib/v2/mongo/models';
import { V2MicroClipModel } from '@/lib/v2/mongo/microModels';
import {
  customDeckImageModelId,
  customDeckImageQuality,
} from '@/lib/v2/decks/images';
import {
  buildMicroMainImageSpec,
  resolveMicroMainImageKey,
} from './main';
import { iconKeyForConcept, planIcon } from './icons';

export type EnqueueMicroImagesResult = {
  enqueued: number;
  reused: number;
  keys: string[];
  skipped: boolean;
};

function microSkipImages(): boolean {
  const v = (process.env.MICRO_SKIP_IMAGES ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * Enqueue main + icon images for a series' ready clips.
 * Always runs for micro (not gated by GENERATE_IMAGES). Set MICRO_SKIP_IMAGES=true to skip.
 */
export async function enqueueMicroSeriesImages(opts: {
  seriesId: string;
  seriesSlug: string;
  targetLang?: string;
  force?: boolean;
}): Promise<EnqueueMicroImagesResult> {
  if (!mongoConfigured()) {
    return { enqueued: 0, reused: 0, keys: [], skipped: true };
  }
  if (microSkipImages()) {
    return { enqueued: 0, reused: 0, keys: [], skipped: true };
  }
  await connectMongo();
  const targetLang = opts.targetLang ?? 'pt-PT';
  const clips = await V2MicroClipModel()
    .find({
      series_id: opts.seriesId,
      status: { $in: ['ready', 'published'] },
    })
    .lean();

  let enqueued = 0;
  let reused = 0;
  const keys: string[] = [];
  const quality = customDeckImageQuality();
  const model = customDeckImageModelId();
  const usedBy = `micro:${opts.seriesSlug}`;

  for (const clip of clips) {
    const mainKey =
      clip.main_image_key ||
      resolveMicroMainImageKey({
        targetLang,
        seriesSlug: opts.seriesSlug,
        clipSlug: clip.slug,
        sceneKey: (clip as { scene_key?: string }).scene_key,
      });
    if (!clip.main_image_key) {
      await V2MicroClipModel().updateOne(
        { _id: clip._id },
        { $set: { main_image_key: mainKey } },
      );
    }
    const existing = await V2ImageModel()
      .findOne({ key: mainKey })
      .select({ status: 1, url: 1 })
      .lean();
    if (
      !opts.force &&
      existing?.url &&
      (existing.status === 'ready' || existing.status === 'flagged')
    ) {
      reused += 1;
    } else {
      const regionObjects = (clip.lines ?? [])
        .map((l) => l.region_hint)
        .filter(Boolean) as string[];
      const spec = buildMicroMainImageSpec({
        title_tl: clip.title_tl,
        layout: clip.layout,
        image_spec:
          typeof clip.image_spec === 'string' ? clip.image_spec : undefined,
        region_objects: regionObjects,
      });
      await V2ImageModel().findOneAndUpdate(
        { key: mainKey },
        {
          $set: {
            status: 'queued',
            reason: null,
            spec,
            type: spec.type,
            kind: 'content',
          },
          $addToSet: { used_by: usedBy },
          $setOnInsert: { key: mainKey, cost_usd: 0, version: 1 },
        },
        { upsert: true },
      );
      await V2JobModel().create({
        kind: 'image',
        status: 'queued',
        lesson_id: `micro.${opts.seriesSlug}`,
        day: 0,
        target_lang: targetLang,
        version: 1,
        attempts: [],
        input: {
          key: mainKey,
          item_id: null,
          source: 'micro',
          manifest_source: 'scene',
          aspect: '4:3',
          force: Boolean(opts.force),
          quality: 'medium',
          model,
        },
      });
      enqueued += 1;
      keys.push(mainKey);
    }

    for (const line of clip.lines ?? []) {
      const concept = line.concept_en?.trim();
      if (!concept) continue;
      const plan = await planIcon({ concept_en: concept });
      if (plan.reused && !opts.force) {
        reused += 1;
        continue;
      }
      const iconKey = plan.key;
      const iconSpec = {
        type: 'object' as const,
        subject: `${concept} simple flat icon`,
        setting: 'plain soft background',
        framing: 'centered 1:1 icon',
        intent: `small flat icon for ${concept}`,
        must_show: [concept, 'simple readable icon'],
        must_avoid: ['text', 'letters', 'logo', 'busy background'],
        characters: [] as string[],
      };
      await V2ImageModel().findOneAndUpdate(
        { key: iconKey },
        {
          $set: {
            status: 'queued',
            reason: null,
            spec: iconSpec,
            type: 'object',
            kind: 'content',
          },
          $addToSet: { used_by: usedBy },
          $setOnInsert: { key: iconKey, cost_usd: 0, version: 1 },
        },
        { upsert: true },
      );
      await V2JobModel().create({
        kind: 'image',
        status: 'queued',
        lesson_id: `micro.${opts.seriesSlug}`,
        day: 0,
        target_lang: targetLang,
        version: 1,
        attempts: [],
        input: {
          key: iconKey,
          item_id: line.item_id,
          source: 'micro_icon',
          manifest_source: 'word',
          aspect: '1:1',
          force: Boolean(opts.force),
          quality,
          model,
        },
      });
      if (!line.icon_key) {
        await V2MicroClipModel().updateOne(
          { _id: clip._id, 'lines.item_id': line.item_id },
          { $set: { 'lines.$.icon_key': iconKeyForConcept(concept) } },
        );
      }
      enqueued += 1;
      keys.push(iconKey);
    }
  }

  return { enqueued, reused, keys, skipped: false };
}
