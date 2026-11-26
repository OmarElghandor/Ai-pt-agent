import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  generateMicroClip,
  type ModelCaller,
} from '@/lib/v2/micro/generate';
import { loadMicroOutline } from '@/lib/v2/micro/outline';
import {
  ensureMicroSeries,
  persistDraftClip,
  persistGeneratedClip,
} from '@/lib/v2/micro/persist';
import { publishMicroClip, publishMicroSeries } from '@/lib/v2/micro/publish';
import { enqueueMicroSeriesImages } from '@/lib/v2/micro/images/enqueue';
import { generateMicroSeriesMainImages } from '@/lib/v2/micro/images/generateMains';
import { applySceneBoxesToSeries } from '@/lib/v2/micro/images/visionBoxes';
import { V2MicroClipModel } from '@/lib/v2/mongo/microModels';

/** In-process lock so concurrent taps return `generating`. */
const ensuring = new Map<string, number>();
const LOCK_TTL_MS = 10 * 60 * 1000;

export type EnsureSeriesStatus = 'ready' | 'generating' | 'failed';

export type EnsureClipError = {
  slug: string;
  reason: string;
  message: string;
};

export type EnsureSeriesResult = {
  status: EnsureSeriesStatus;
  series_slug: string;
  series_id?: string;
  clip_count: number;
  ready_count: number;
  generated: number;
  images?: {
    enqueued: number;
    reused: number;
    skipped: boolean;
    mains_generated?: number;
    mains_failed?: number;
    boxes_located?: number;
    boxes_flagged?: number;
  };
  error?: string;
  clip_errors?: EnsureClipError[];
};

function lockKey(lang: string, slug: string): string {
  return `${lang}:${slug}`;
}

export function isSeriesEnsuring(lang: string, slug: string): boolean {
  const key = lockKey(lang, slug);
  const at = ensuring.get(key);
  if (!at) return false;
  if (Date.now() - at > LOCK_TTL_MS) {
    ensuring.delete(key);
    return false;
  }
  return true;
}

export type EnsureSeriesOpts = {
  seriesSlug: string;
  targetLang?: string;
  callModel?: ModelCaller;
  /** Skip image enqueue (tests). */
  skipImages?: boolean;
  /** Injected for tests — when true, treat as already locked. */
  forceGenerating?: boolean;
  /**
   * Test-only dry run: skip Mongo persist/publish/images.
   * Uses `alreadyReadySlugs` instead of the DB to decide which clips need generate.
   */
  dryRun?: boolean;
  /** Outline clip slugs already ready (dryRun / tests). */
  alreadyReadySlugs?: Set<string>;
};

/**
 * Ensure all outline clips for a series exist (generate-if-missing) + images + publish.
 * Shared once per language — not per user.
 */
export async function ensureMicroSeriesContent(
  opts: EnsureSeriesOpts,
): Promise<EnsureSeriesResult> {
  const targetLang = opts.targetLang ?? 'pt-PT';
  const slug = opts.seriesSlug;
  const key = lockKey(targetLang, slug);

  if (opts.forceGenerating || isSeriesEnsuring(targetLang, slug)) {
    return {
      status: 'generating',
      series_slug: slug,
      clip_count: 0,
      ready_count: 0,
      generated: 0,
    };
  }

  let seriesOutline;
  try {
    const outline = loadMicroOutline();
    seriesOutline = outline.series.find((s) => s.slug === slug);
  } catch (err) {
    return {
      status: 'failed',
      series_slug: slug,
      clip_count: 0,
      ready_count: 0,
      generated: 0,
      error: 'outline_load_failed',
      clip_errors: [
        {
          slug,
          reason: 'outline_load_failed',
          message: err instanceof Error ? err.message : String(err),
        },
      ],
    };
  }

  if (!seriesOutline) {
    return {
      status: 'failed',
      series_slug: slug,
      clip_count: 0,
      ready_count: 0,
      generated: 0,
      error: 'series_not_in_outline',
    };
  }

  if (!opts.dryRun && !mongoConfigured()) {
    return {
      status: 'failed',
      series_slug: slug,
      clip_count: seriesOutline.clips.length,
      ready_count: 0,
      generated: 0,
      error: 'mongo_unavailable',
    };
  }

  ensuring.set(key, Date.now());
  const clip_errors: EnsureClipError[] = [];
  try {
    if (opts.dryRun) {
      const already = opts.alreadyReadySlugs ?? new Set<string>();
      let generated = 0;
      for (const clip of seriesOutline.clips) {
        if (already.has(clip.slug)) continue;
        try {
          const result = await generateMicroClip({
            series: seriesOutline,
            clip,
            targetLang,
            callModel: opts.callModel,
          });
          if (result.ok) {
            generated += 1;
          } else {
            clip_errors.push({
              slug: clip.slug,
              reason: result.reason,
              message: result.message,
            });
          }
        } catch (err) {
          clip_errors.push({
            slug: clip.slug,
            reason: 'throw',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
      const ready_count = already.size + generated;
      return {
        status: ready_count > 0 ? 'ready' : 'failed',
        series_slug: slug,
        clip_count: seriesOutline.clips.length,
        ready_count,
        generated,
        error: ready_count > 0 ? undefined : 'no_ready_clips',
        clip_errors: clip_errors.length ? clip_errors : undefined,
      };
    }

    await connectMongo();
    const seriesId = await ensureMicroSeries(seriesOutline, targetLang);
    const Clip = V2MicroClipModel();
    let generated = 0;
    let firstHard: string | undefined;

    for (const clip of seriesOutline.clips) {
      // Scope by series_id so orphan rows under another series don't skip gen.
      const existing = await Clip.findOne({
        series_id: seriesId,
        target_lang: targetLang,
        slug: clip.slug,
        status: { $in: ['ready', 'published'] },
      })
        .select({ _id: 1, lines: 1 })
        .lean();
      if (existing && (existing.lines?.length ?? 0) >= 6) {
        continue;
      }

      try {
        const result = await generateMicroClip({
          series: seriesOutline,
          clip,
          targetLang,
          callModel: opts.callModel,
        });
        if (!result.ok) {
          clip_errors.push({
            slug: clip.slug,
            reason: result.reason,
            message: result.message,
          });
          if (result.lines.length > 0) {
            await persistDraftClip({
              seriesId,
              seriesSlug: seriesOutline.slug,
              clip,
              targetLang,
              lines: result.lines,
              title_ar: clip.title_ar,
              title_tl: clip.title_tl,
              draft_reason: result.message,
              cost_tokens: result.cost_tokens,
            });
          }
          continue;
        }
        const clipId = await persistGeneratedClip({
          seriesId,
          seriesSlug: seriesOutline.slug,
          clip,
          targetLang,
          result,
        });
        generated += 1;
        // Publish may fail on incomplete scene boxes — still count as ready for play.
        await publishMicroClip(clipId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        clip_errors.push({
          slug: clip.slug,
          reason: 'throw',
          message,
        });
        if (!firstHard) firstHard = message;
      }
    }

    // Ready = ≥6 lines under this series (box_flagged OK for learner play).
    const readyClips = await Clip.find({
      series_id: seriesId,
      status: { $in: ['ready', 'published', 'draft'] },
    })
      .select({ _id: 1, lines: 1, status: 1 })
      .lean();
    const withLines = readyClips.filter((c) => (c.lines?.length ?? 0) >= 6);
    // Prefer ready|published; drafts with enough lines also count after we bump them.
    let ready_count = withLines.filter((c) =>
      c.status === 'ready' || c.status === 'published',
    ).length;

    // Promote any draft that somehow has ≥6 lines to ready so learners can play.
    for (const c of withLines) {
      if (c.status === 'draft') {
        await Clip.updateOne(
          { _id: c._id },
          { $set: { status: 'ready', draft_reason: null } },
        );
        ready_count += 1;
      }
    }

    const clip_count = seriesOutline.clips.length;

    let images: EnsureSeriesResult['images'];
    if (!opts.skipImages && ready_count > 0) {
      const img = await enqueueMicroSeriesImages({
        seriesId,
        seriesSlug: slug,
        targetLang,
      });
      const mains = await generateMicroSeriesMainImages({
        seriesId,
        seriesSlug: slug,
        targetLang,
      });
      const boxes = await applySceneBoxesToSeries({ seriesId });
      images = {
        enqueued: img.enqueued,
        reused: img.reused + mains.reused,
        skipped: img.skipped,
        mains_generated: mains.generated,
        mains_failed: mains.failed,
        boxes_located: boxes.located,
        boxes_flagged: boxes.flagged,
      };
    }

    if (ready_count > 0) {
      await publishMicroSeries(seriesId);
    }

    if (ready_count < 1) {
      return {
        status: 'failed',
        series_slug: slug,
        series_id: seriesId,
        clip_count,
        ready_count,
        generated,
        images,
        error: firstHard ?? 'no_ready_clips',
        clip_errors: clip_errors.length ? clip_errors : undefined,
      };
    }

    return {
      status: 'ready',
      series_slug: slug,
      series_id: seriesId,
      clip_count,
      ready_count,
      generated,
      images,
      clip_errors: clip_errors.length ? clip_errors : undefined,
    };
  } catch (err) {
    return {
      status: 'failed',
      series_slug: slug,
      clip_count: seriesOutline.clips.length,
      ready_count: 0,
      generated: 0,
      error: err instanceof Error ? err.message : String(err),
      clip_errors: clip_errors.length ? clip_errors : undefined,
    };
  } finally {
    ensuring.delete(key);
  }
}

/** Pure: merge outline + DB rows for the topics list. */
export function mergeSeriesListing(opts: {
  outline: Array<{
    slug: string;
    order: number;
    title_ar: string;
    title_tl: string;
    clip_count: number;
  }>;
  db: Array<{
    id: string;
    slug: string;
    title_ar: string;
    title_tl: string;
    order: number;
    clip_count: number;
    finished_count: number;
    in_progress: boolean;
    official_deck_id: string | null;
    levels: number[];
    status: string;
    ready_clip_count: number;
    thumb_url?: string | null;
  }>;
  ensuringSlugs?: Set<string>;
}): Array<{
  slug: string;
  order: number;
  title_ar: string;
  title_tl: string;
  clip_count: number;
  status: 'missing' | 'generating' | 'ready';
  id: string | null;
  finished_count: number;
  in_progress: boolean;
  official_deck_id: string | null;
  levels: number[];
  ready_clip_count: number;
  thumb_url: string | null;
}> {
  const bySlug = new Map(opts.db.map((d) => [d.slug, d]));
  return opts.outline
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((o) => {
      const d = bySlug.get(o.slug);
      const thumb = d?.thumb_url ?? null;
      if (opts.ensuringSlugs?.has(o.slug)) {
        return {
          slug: o.slug,
          order: o.order,
          title_ar: o.title_ar,
          title_tl: o.title_tl,
          clip_count: o.clip_count,
          status: 'generating' as const,
          id: d?.id ?? null,
          finished_count: d?.finished_count ?? 0,
          in_progress: d?.in_progress ?? false,
          official_deck_id: d?.official_deck_id ?? null,
          levels: d?.levels ?? [],
          ready_clip_count: d?.ready_clip_count ?? 0,
          thumb_url: thumb,
        };
      }
      if (d && d.ready_clip_count > 0 && d.status === 'published') {
        return {
          slug: o.slug,
          order: o.order,
          title_ar: d.title_ar,
          title_tl: d.title_tl,
          clip_count: Math.max(o.clip_count, d.clip_count),
          status: 'ready' as const,
          id: d.id,
          finished_count: d.finished_count,
          in_progress: d.in_progress,
          official_deck_id: d.official_deck_id,
          levels: d.levels,
          ready_clip_count: d.ready_clip_count,
          thumb_url: thumb,
        };
      }
      if (d && d.ready_clip_count > 0) {
        return {
          slug: o.slug,
          order: o.order,
          title_ar: d.title_ar,
          title_tl: d.title_tl,
          clip_count: Math.max(o.clip_count, d.clip_count),
          status: 'ready' as const,
          id: d.id,
          finished_count: d.finished_count,
          in_progress: d.in_progress,
          official_deck_id: d.official_deck_id,
          levels: d.levels,
          ready_clip_count: d.ready_clip_count,
          thumb_url: thumb,
        };
      }
      return {
        slug: o.slug,
        order: o.order,
        title_ar: o.title_ar,
        title_tl: o.title_tl,
        clip_count: o.clip_count,
        status: 'missing' as const,
        id: d?.id ?? null,
        finished_count: d?.finished_count ?? 0,
        in_progress: false,
        official_deck_id: d?.official_deck_id ?? null,
        levels: d?.levels ?? [],
        ready_clip_count: d?.ready_clip_count ?? 0,
        thumb_url: thumb,
      };
    });
}

/** Test helper */
export function clearEnsureLocks(): void {
  ensuring.clear();
}

export function markEnsureLock(lang: string, slug: string): void {
  ensuring.set(lockKey(lang, slug), Date.now());
}
