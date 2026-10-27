import { isGenerateImagesEnabled } from '@/lib/v2/flags';
import { generatePackImages } from './images';
import { generateLessonDraft, type GenerateResult } from './lesson/run';
import { buildDayCost, logDayCost } from './lesson/cost';
import { V2LessonModel } from '@/lib/v2/mongo/models';
import { connectMongo } from '@/lib/mongo';
import type { ImageJobResult } from './images/generate';

export type FullGenerateResult = GenerateResult & {
  images: ImageJobResult[];
};

/**
 * Text generation via staged pipeline. Images only if GENERATE_IMAGES=true
 * (default false). Audio is never warmed here — use warm-audio route/script.
 */
export async function generateLessonFull(opts: {
  day: number;
  version?: number;
  skipImages?: boolean;
  /** @deprecated Audio is never run during generation. */
  skipAudio?: boolean;
}): Promise<FullGenerateResult> {
  const draft = await generateLessonDraft({
    day: opts.day,
    version: opts.version,
    skipImages: opts.skipImages,
  });

  let images: ImageJobResult[] = [];
  let imageStats = { generated: 0, skipped: 0, flagged: 0 };

  const wantImages =
    isGenerateImagesEnabled() && opts.skipImages !== true && !draft.flagged;

  if (wantImages) {
    const img = await generatePackImages(draft.pack);
    images = img.results;
    imageStats = {
      generated: img.generated,
      skipped: img.skipped,
      flagged: img.flagged,
    };
  } else {
    imageStats.skipped = 1;
  }

  const cost = buildDayCost({
    model: draft.cost.claude.model,
    durationMs: draft.cost.claude.duration_ms,
    usage: {
      input_tokens: draft.cost.claude.input_tokens,
      output_tokens: draft.cost.claude.output_tokens,
      cache_creation_input_tokens: draft.cost.claude.cache_creation_input_tokens,
      cache_read_input_tokens: draft.cost.claude.cache_read_input_tokens,
    },
    images: imageStats,
    calls: draft.cost.calls ?? draft.timings,
  });
  logDayCost(opts.day, cost);

  const flagged =
    draft.flagged || imageStats.flagged > 0 || images.some((i) => i.status === 'flagged');

  await connectMongo();
  await V2LessonModel().updateOne(
    {
      day: draft.saved.day,
      target_lang: draft.saved.target_lang,
      version: draft.saved.version,
    },
    {
      $set: {
        meta: {
          ...draft.saved.meta,
          flagged,
          cost,
          image_flags: images
            .filter((i) => i.status === 'flagged')
            .map((i) => `${i.key}: ${i.reason ?? 'flagged'}`),
        },
      },
    },
  );

  return {
    ...draft,
    flagged,
    cost,
    images,
  };
}
