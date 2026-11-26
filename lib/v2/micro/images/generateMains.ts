import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { generateContentImage } from '@/lib/v2/images/generateOne';
import { V2ImageModel } from '@/lib/v2/mongo/models';
import { V2MicroClipModel } from '@/lib/v2/mongo/microModels';
import type { ImageSpec } from '@/lib/v2/generation/images/templates';
import { buildMicroMainImageSpec, microMainImageKey } from './main';

export type GenerateMicroMainsResult = {
  generated: number;
  reused: number;
  failed: number;
  keys: string[];
  errors: Array<{ key: string; message: string }>;
};

/**
 * Sync-generate main clip pictures so the player has URLs without waiting for the worker.
 */
export async function generateMicroSeriesMainImages(opts: {
  seriesId: string;
  seriesSlug: string;
  targetLang?: string;
  force?: boolean;
}): Promise<GenerateMicroMainsResult> {
  if (!mongoConfigured()) {
    return { generated: 0, reused: 0, failed: 0, keys: [], errors: [] };
  }
  await connectMongo();
  const targetLang = opts.targetLang ?? 'pt-PT';
  const clips = await V2MicroClipModel()
    .find({
      series_id: opts.seriesId,
      status: { $in: ['ready', 'published'] },
    })
    .sort({ order: 1 })
    .lean();

  let generated = 0;
  let reused = 0;
  let failed = 0;
  const keys: string[] = [];
  const errors: Array<{ key: string; message: string }> = [];
  const usedBy = [`micro:${opts.seriesSlug}`];

  for (const clip of clips) {
    const key =
      clip.main_image_key ||
      microMainImageKey(targetLang, opts.seriesSlug, clip.slug);
    keys.push(key);

    const existing = await V2ImageModel()
      .findOne({ key })
      .select({ status: 1, url: 1, spec: 1 })
      .lean();
    if (
      !opts.force &&
      existing?.status === 'ready' &&
      typeof existing.url === 'string' &&
      existing.url
    ) {
      reused += 1;
      continue;
    }

    const regionObjects = (clip.lines ?? [])
      .map((l) => l.region_hint)
      .filter(Boolean) as string[];
    const spec: ImageSpec =
      (existing?.spec as ImageSpec | undefined) ??
      buildMicroMainImageSpec({
        title_tl: clip.title_tl,
        layout: clip.layout,
        image_spec:
          typeof clip.image_spec === 'string' ? clip.image_spec : undefined,
        region_objects: regionObjects,
      });

    try {
      let result = await generateContentImage({
        key,
        spec,
        usedBy,
        force: opts.force,
        quality: 'medium',
        ratio: '4:3',
      });
      if (result.skipped) {
        await V2ImageModel().updateOne(
          { key, status: { $in: ['generating', 'queued'] } },
          {
            $set: { status: 'failed', reason: 'reclaimed after lock skip' },
            $unset: { generating_started_at: 1 },
          },
        );
        result = await generateContentImage({
          key,
          spec,
          usedBy,
          force: true,
          quality: 'medium',
          ratio: '4:3',
        });
      }
      if (
        result.doc.status === 'ready' &&
        typeof result.doc.url === 'string' &&
        result.doc.url
      ) {
        generated += 1;
      } else {
        failed += 1;
        errors.push({
          key,
          message: result.reason ?? result.doc.reason ?? result.doc.status,
        });
      }
    } catch (err) {
      failed += 1;
      errors.push({
        key,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { generated, reused, failed, keys, errors };
}
