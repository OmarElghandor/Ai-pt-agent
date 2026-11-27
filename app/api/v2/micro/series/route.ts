import { NextResponse } from 'next/server';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { getCurrentV2UserId } from '@/lib/v2/auth/session';
import { isV2Enabled } from '@/lib/v2/flags';
import {
  isSeriesEnsuring,
  mergeSeriesListing,
} from '@/lib/v2/micro/ensure';
import { microMainImageKey } from '@/lib/v2/micro/images/main';
import { loadMicroOutline } from '@/lib/v2/micro/outline';
import {
  compareClipsByLevelThenOrder,
  compareSeriesByLevelThenOrder,
  minLevel,
} from '@/lib/v2/micro/order';
import {
  V2MicroClipModel,
  V2MicroProgressModel,
  V2MicroSeriesModel,
} from '@/lib/v2/mongo/microModels';

export const runtime = 'nodejs';

export async function GET() {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  const userId = await getCurrentV2UserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const outline = loadMicroOutline();
  const sampleBySlug = new Map(
    outline.series.map((s) => [
      s.slug,
      s.clips.slice(0, 3).map((c) => c.title_tl),
    ]),
  );
  const outlineLevelsBySlug = new Map(
    outline.series.map((s) => [
      s.slug,
      [...new Set(s.clips.map((c) => c.level))].sort((a, b) => a - b),
    ]),
  );
  const outlineRows = outline.series.map((s) => ({
    slug: s.slug,
    order: s.order,
    title_ar: s.title_ar,
    title_tl: s.title_tl,
    clip_count: s.clips.length,
  }));

  if (!mongoConfigured()) {
    const all = mergeSeriesListing({ outline: outlineRows, db: [] })
      .map((row) => {
        const levels = outlineLevelsBySlug.get(row.slug) ?? row.levels ?? [];
        return {
          ...row,
          levels,
          sample_tls: sampleBySlug.get(row.slug) ?? [],
        };
      })
      .sort((a, b) =>
        compareSeriesByLevelThenOrder(
          { min_level: minLevel(a.levels), order: a.order },
          { min_level: minLevel(b.levels), order: b.order },
        ),
      );
    return NextResponse.json({
      series: all,
      all,
      finished_clips: [],
    });
  }

  await connectMongo();
  const series = await V2MicroSeriesModel()
    .find({ target_lang: outline.target_lang })
    .sort({ order: 1 })
    .lean();
  const clips = await V2MicroClipModel()
    .find({ target_lang: outline.target_lang })
    .select({
      series_id: 1,
      level: 1,
      slug: 1,
      order: 1,
      status: 1,
      lines: 1,
      main_image_key: 1,
      title_ar: 1,
      title_tl: 1,
    })
    .lean();
  const progress = await V2MicroProgressModel()
    .find({ user_id: userId })
    .lean();
  const finished = new Set(
    progress.filter((p) => p.finished_at).map((p) => p.clip_id),
  );
  const startedSeries = new Set<string>();
  for (const p of progress) {
    const c = clips.find((x) => String(x._id) === p.clip_id);
    if (c) startedSeries.add(c.series_id);
  }

  const thumbCandidates = series.flatMap((s) => {
    const sc = clips
      .filter((c) => c.series_id === String(s._id))
      .slice()
      .sort((a, b) => a.order - b.order);
    return sc.map(
      (c) =>
        c.main_image_key ||
        microMainImageKey(outline.target_lang, s.slug, c.slug),
    );
  });
  let thumbByKey = new Map<string, string>();
  if (thumbCandidates.length) {
    const { V2ImageModel } = await import('@/lib/v2/mongo/models');
    const imgs = await V2ImageModel()
      .find({
        key: { $in: [...new Set(thumbCandidates)] },
        status: { $in: ['ready', 'flagged'] },
        url: { $exists: true, $ne: '' },
      })
      .select({ key: 1, url: 1 })
      .lean();
    thumbByKey = new Map(
      imgs.map((img) => [img.key as string, img.url as string]),
    );
  }

  const db = series.map((s) => {
    const sc = clips.filter((c) => c.series_id === String(s._id));
    const readyClips = sc.filter(
      (c) =>
        (c.status === 'ready' || c.status === 'published') &&
        (c.lines?.length ?? 0) >= 6,
    );
    const finishedCount = readyClips.filter((c) =>
      finished.has(String(c._id)),
    ).length;
    const levelsFromDb = [...new Set(sc.map((c) => c.level))].sort(
      (a, b) => a - b,
    );
    const levels =
      levelsFromDb.length > 0
        ? levelsFromDb
        : (outlineLevelsBySlug.get(s.slug) ?? []);
    let thumb_url: string | null = null;
    for (const c of sc.slice().sort((a, b) => a.order - b.order)) {
      const key =
        c.main_image_key ||
        microMainImageKey(outline.target_lang, s.slug, c.slug);
      const url = thumbByKey.get(key);
      if (url) {
        thumb_url = url;
        break;
      }
    }
    return {
      id: String(s._id),
      slug: s.slug,
      title_ar: s.title_ar,
      title_tl: s.title_tl,
      order: s.order,
      clip_count: Math.max(
        sc.length,
        outlineRows.find((o) => o.slug === s.slug)?.clip_count ?? 0,
      ),
      finished_count: finishedCount,
      in_progress:
        startedSeries.has(String(s._id)) && finishedCount < readyClips.length,
      official_deck_id: s.official_deck_id ?? null,
      levels,
      status: s.status,
      ready_clip_count: readyClips.length,
      thumb_url,
    };
  });

  const ensuringSlugs = new Set(
    outlineRows
      .filter((o) => isSeriesEnsuring(outline.target_lang, o.slug))
      .map((o) => o.slug),
  );

  const all = mergeSeriesListing({ outline: outlineRows, db, ensuringSlugs })
    .map((row) => {
      const levels =
        row.levels?.length > 0
          ? row.levels
          : (outlineLevelsBySlug.get(row.slug) ?? []);
      return {
        ...row,
        levels,
        sample_tls: sampleBySlug.get(row.slug) ?? [],
      };
    })
    .sort((a, b) =>
      compareSeriesByLevelThenOrder(
        { min_level: minLevel(a.levels), order: a.order },
        { min_level: minLevel(b.levels), order: b.order },
      ),
    );

  const seriesById = new Map(series.map((s) => [String(s._id), s]));
  const finished_clips = clips
    .filter(
      (c) =>
        c.status === 'published' &&
        finished.has(String(c._id)) &&
        (c.lines?.length ?? 0) >= 1,
    )
    .map((c) => {
      const s = seriesById.get(c.series_id);
      return {
        id: String(c._id),
        slug: c.slug,
        series_slug: s?.slug ?? '',
        series_order: s?.order ?? 0,
        series_title_ar: s?.title_ar ?? '',
        title_ar: c.title_ar,
        title_tl: c.title_tl,
        level: c.level,
        order: c.order,
        line_count: c.lines?.length ?? 0,
        official_deck_id: s?.official_deck_id ?? null,
      };
    })
    .sort((a, b) =>
      compareClipsByLevelThenOrder(
        {
          level: a.level,
          series_order: a.series_order,
          order: a.order,
        },
        {
          level: b.level,
          series_order: b.series_order,
          order: b.order,
        },
      ),
    );

  return NextResponse.json({
    series: all,
    all,
    finished_clips,
  });
}
