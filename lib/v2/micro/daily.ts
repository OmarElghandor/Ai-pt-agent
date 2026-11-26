import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  V2MicroClipModel,
  V2MicroDailyModel,
  V2MicroProgressModel,
  V2MicroSeriesModel,
} from '@/lib/v2/mongo/microModels';

const DEFAULT_SERIES_ORDER = [
  'demonstratives',
  'didnt-understand',
  'daily-verbs',
  'question-words',
  'quick-replies',
  'time',
  'numbers-money',
  'where-is-it',
  'your-day',
  'how-you-feel',
  'linking',
  'polite-requests',
  'possessives',
  'adjectives-colours',
  'negation',
  'conjugation-induction',
];

export type DailyPick = {
  clip_id: string;
  series_slug: string;
  clip_slug: string;
  title_ar: string;
  title_tl: string;
  layout: string;
  level: number;
};

/**
 * Pick «لقطة النهارده» once per user × local date (19 §6).
 * Pure ranking when `candidates` injected (tests).
 */
export function rankDailyClip(opts: {
  unfinished: Array<{
    clip_id: string;
    series_slug: string;
    item_ids: string[];
    order_in_series: number;
    series_order: number;
  }>;
  lessonItemIds: string[];
  startedSeriesSlugs: string[];
}): string | null {
  if (opts.unfinished.length === 0) return null;
  const lesson = new Set(opts.lessonItemIds);
  let best: { id: string; score: number } | null = null;
  for (const c of opts.unfinished) {
    const overlap = c.item_ids.filter((id) => lesson.has(id)).length;
    if (overlap > 0) {
      if (!best || overlap > best.score) best = { id: c.clip_id, score: overlap };
    }
  }
  if (best) return best.id;

  const started = new Set(opts.startedSeriesSlugs);
  const inStarted = opts.unfinished
    .filter((c) => started.has(c.series_slug))
    .sort(
      (a, b) =>
        a.series_order - b.series_order || a.order_in_series - b.order_in_series,
    );
  if (inStarted[0]) return inStarted[0].clip_id;

  const byDefault = [...opts.unfinished].sort((a, b) => {
    const ai = DEFAULT_SERIES_ORDER.indexOf(a.series_slug);
    const bi = DEFAULT_SERIES_ORDER.indexOf(b.series_slug);
    const ao = ai === -1 ? 999 : ai;
    const bo = bi === -1 ? 999 : bi;
    return ao - bo || a.order_in_series - b.order_in_series;
  });
  return byDefault[0]?.clip_id ?? null;
}

export async function getOrPickDailyClip(opts: {
  userId: string;
  localDate: string;
  lessonItemIds: string[];
}): Promise<DailyPick | null> {
  if (!mongoConfigured()) return null;
  await connectMongo();

  const existing = await V2MicroDailyModel()
    .findOne({ user_id: opts.userId, local_date: opts.localDate })
    .lean();
  if (existing) {
    const clip = await V2MicroClipModel().findById(existing.clip_id).lean();
    if (clip) {
      return {
        clip_id: String(clip._id),
        series_slug: clip.series_slug,
        clip_slug: clip.slug,
        title_ar: clip.title_ar,
        title_tl: clip.title_tl,
        layout: clip.layout,
        level: clip.level,
      };
    }
  }

  const series = await V2MicroSeriesModel()
    .find({ status: 'published' })
    .lean();
  const seriesById = new Map(series.map((s) => [String(s._id), s]));
  const clips = await V2MicroClipModel()
    .find({ status: 'published' })
    .sort({ order: 1 })
    .lean();
  const progress = await V2MicroProgressModel()
    .find({ user_id: opts.userId })
    .lean();
  const finished = new Set(
    progress.filter((p) => p.finished_at).map((p) => p.clip_id),
  );
  const startedSeries = new Set(
    progress
      .map((p) => {
        const c = clips.find((x) => String(x._id) === p.clip_id);
        return c?.series_slug;
      })
      .filter(Boolean) as string[],
  );

  const unfinished = clips
    .filter((c) => !finished.has(String(c._id)))
    .map((c) => {
      const s = seriesById.get(c.series_id);
      return {
        clip_id: String(c._id),
        series_slug: c.series_slug,
        item_ids: (c.lines ?? []).map((l) => l.item_id),
        order_in_series: c.order,
        series_order: s?.order ?? 999,
      };
    });

  const pickId = rankDailyClip({
    unfinished,
    lessonItemIds: opts.lessonItemIds,
    startedSeriesSlugs: [...startedSeries],
  });
  if (!pickId) return null;

  await V2MicroDailyModel().updateOne(
    { user_id: opts.userId, local_date: opts.localDate },
    { $set: { clip_id: pickId } },
    { upsert: true },
  );

  const clip = clips.find((c) => String(c._id) === pickId)!;
  return {
    clip_id: pickId,
    series_slug: clip.series_slug,
    clip_slug: clip.slug,
    title_ar: clip.title_ar,
    title_tl: clip.title_tl,
    layout: clip.layout,
    level: clip.level,
  };
}
