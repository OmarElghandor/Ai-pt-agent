import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { lessonIdFor } from '@/lib/v2/generation/lesson/graph';
import { sizeForRatio } from '@/lib/v2/generation/images/templates';
import { V2ImageModel, V2JobModel } from '@/lib/v2/mongo/models';
import { buildImageManifest, type ManifestEntry } from './manifest';
import { estimateImageCostUsd } from './pricing';
import type { ImageAspect } from './cloudinaryUrl';
import type { V2ImageStatus } from './types';
import { loadLessonAndStoryForImages } from './loadLesson';

const IMAGE_JOB_KINDS = ['image_specs', 'image'] as const;

const NEED_GENERATE: ReadonlySet<V2ImageStatus | 'missing'> = new Set([
  'missing',
  'queued',
  'failed',
  'flagged',
  'blocked',
]);

/** Same window as claimImageLock stale reset. */
const STALE_GENERATING_MS = 10 * 60 * 1000;

export type ImageJobInput = {
  key: string;
  item_id: string | null;
  manifest_source: ManifestEntry['source'];
  aspect: ImageAspect;
  force: boolean;
};

export type EnqueueLessonImagesResult = {
  day: number;
  target_lang: string;
  lesson_id: string;
  version: number;
  missingCount: number;
  estimateUsd: number;
  imageSpecsJobId: string;
  jobIds: string[];
  keys: string[];
};

function estimateForAspect(aspect: ImageAspect): number {
  const size = sizeForRatio(aspect === '4:3' ? '4:3' : aspect);
  return estimateImageCostUsd({ size, quality: 'medium' });
}

async function markQueued(keys: string[]): Promise<void> {
  if (!keys.length) return;
  const Model = V2ImageModel();
  await Promise.all(
    keys.map((key) =>
      Model.findOneAndUpdate(
        { key },
        {
          $set: { status: 'queued' as const, reason: null },
          $setOnInsert: {
            key,
            kind: 'content',
            cost_usd: 0,
            version: 1,
            used_by: [],
          },
        },
        { upsert: true },
      ),
    ),
  );
}

async function reclaimStaleGenerating(): Promise<number> {
  const Model = V2ImageModel();
  const staleBefore = new Date(Date.now() - STALE_GENERATING_MS);
  const res = await Model.updateMany(
    {
      status: 'generating',
      generating_started_at: { $lt: staleBefore },
    },
    {
      $set: {
        status: 'failed',
        reason: 'stale generating reset',
      },
      $unset: { generating_started_at: 1 },
    },
  );
  return res.modifiedCount ?? 0;
}

/** Unlock any-age generating locks for keys we are about to enqueue. */
async function reclaimGeneratingForKeys(keys: string[]): Promise<number> {
  if (!keys.length) return 0;
  const Model = V2ImageModel();
  const res = await Model.updateMany(
    { key: { $in: keys }, status: 'generating' },
    {
      $set: {
        status: 'failed',
        reason: 'reclaimed for enqueue',
      },
      $unset: { generating_started_at: 1 },
    },
  );
  return res.modifiedCount ?? 0;
}

/**
 * Enqueue soft `image_specs` + one `image` job per key for a lesson.
 * Does not touch text DAG jobs.
 */
export async function enqueueLessonImages(opts: {
  day: number;
  targetLang?: string;
  /** Only these keys (regenerate). Default: all missing-like keys. */
  keys?: string[];
  /** Reclaim ready / generating images. */
  force?: boolean;
}): Promise<EnqueueLessonImagesResult> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();

  const day = opts.day;
  const force = Boolean(opts.force);
  const { lesson, story } = await loadLessonAndStoryForImages(day);
  if (!lesson && !story) {
    throw new Error(`no lesson/story for day ${day}`);
  }

  const target_lang =
    opts.targetLang ?? story?.target_lang ?? lesson?.target_lang ?? 'pt-PT';
  const version = lesson?.version ?? 1;
  const lesson_id = lessonIdFor(day, target_lang);
  const pack = lesson?.pack ?? ({ items: [], pages: [], lesson: {} } as never);

  const manifest = buildImageManifest({
    pack,
    story,
    day,
    targetLang: target_lang,
  });
  const byKey = new Map(manifest.map((e) => [e.key, e]));

  const stale = await reclaimStaleGenerating();
  if (stale > 0) {
    console.info(`[v2-images] reclaimed ${stale} stale generating keys`);
  }

  // Bulk: unlock any stuck generating on the whole manifest before filtering.
  if (!opts.keys?.length) {
    const unlocked = await reclaimGeneratingForKeys(manifest.map((e) => e.key));
    if (unlocked > 0) {
      console.info(`[v2-images] unlocked ${unlocked} generating keys for bulk`);
    }
  }

  let entries: ManifestEntry[];
  if (opts.keys?.length) {
    entries = [];
    for (const key of opts.keys) {
      const entry = byKey.get(key);
      if (!entry) {
        throw new Error(`key not in day ${day} manifest: ${key}`);
      }
      entries.push(entry);
    }
  } else {
    const docs = await V2ImageModel()
      .find({ key: { $in: manifest.map((e) => e.key) } })
      .select({ key: 1, status: 1 })
      .lean();
    const statusByKey = new Map(
      docs.map((d) => [d.key as string, d.status as V2ImageStatus]),
    );
    entries = manifest.filter((entry) => {
      const status = statusByKey.get(entry.key);
      if (!status) return true;
      if (force) return true;
      // generating already reclaimed above → should not appear; keep defensive skip
      if (status === 'generating') return true;
      if (status === 'ready') return false;
      return NEED_GENERATE.has(status);
    });
  }

  if (entries.length === 0) {
    return {
      day,
      target_lang,
      lesson_id,
      version,
      missingCount: 0,
      estimateUsd: 0,
      imageSpecsJobId: '',
      jobIds: [],
      keys: [],
    };
  }

  const estimateUsd = entries.reduce(
    (sum, e) => sum + estimateForAspect(e.aspect),
    0,
  );

  const Job = V2JobModel();
  const keys = entries.map((e) => e.key);

  // Unlock generating for the exact keys we enqueue (covers single-key path too).
  const unlocked = await reclaimGeneratingForKeys(keys);
  if (unlocked > 0) {
    console.info(`[v2-images] unlocked ${unlocked} generating for enqueue keys`);
  }

  // Only clear prior image jobs — never wipe the text DAG.
  // Single-key regen only removes image jobs for those keys so other
  // in-flight keys keep their depends_on intact.
  if (opts.keys?.length) {
    await Job.deleteMany({
      day,
      target_lang,
      kind: 'image',
      status: { $in: ['queued', 'running', 'failed', 'stale'] },
      'input.key': { $in: keys },
    });
  } else {
    await Job.deleteMany({
      day,
      target_lang,
      kind: { $in: [...IMAGE_JOB_KINDS] },
      status: { $in: ['queued', 'running', 'failed', 'stale'] },
    });
  }

  await markQueued(keys);

  const specsJob = await Job.create({
    kind: 'image_specs',
    lesson_id,
    day,
    target_lang,
    version,
    status: 'queued',
    depends_on: [],
    input: { keys, force },
  });

  const imageJobs = await Job.insertMany(
    entries.map((entry) => ({
      kind: 'image' as const,
      lesson_id,
      day,
      target_lang,
      version,
      status: 'queued' as const,
      depends_on: [specsJob._id],
      input: {
        key: entry.key,
        item_id: entry.itemId ?? null,
        manifest_source: entry.source,
        aspect: entry.aspect,
        force,
      } satisfies ImageJobInput,
    })),
  );

  const jobIds = [String(specsJob._id), ...imageJobs.map((j) => String(j._id))];

  return {
    day,
    target_lang,
    lesson_id,
    version,
    missingCount: entries.length,
    estimateUsd: Math.round(estimateUsd * 1000) / 1000,
    imageSpecsJobId: String(specsJob._id),
    jobIds,
    keys,
  };
}
