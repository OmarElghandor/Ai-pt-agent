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
  const outlineRows = outline.series.map((s) => ({
    slug: s.slug,
    order: s.order,
    title_ar: s.title_ar,
    title_tl: s.title_tl,
    clip_count: s.clips.length,
  }));

  if (!mongoConfigured()) {
    const all = mergeSeriesListing({ outline: outlineRows, db: [] }).map(
      (row) => ({
        ...row,
        sample_tls: sampleBySlug.get(row.slug) ?? [],
      }),
    );
    return NextResponse.json({
      continuing: [],
      series: all,
      all,
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

  // Candidate keys: each clip's main_image_key or computed micro key (by order).
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
    // Player shows ready + flagged-with-url; listing must match.
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
    const levels = [...new Set(sc.map((c) => c.level))].sort();
    // First ready main by clip order (not only order=1 if that image is missing).
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
      clip_count: Math.max(sc.length, outlineRows.find((o) => o.slug === s.slug)?.clip_count ?? 0),
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

  const all = mergeSeriesListing({ outline: outlineRows, db, ensuringSlugs }).map(
    (row) => ({
      ...row,
      sample_tls: sampleBySlug.get(row.slug) ?? [],
    }),
  );
  const continuing = all.filter((r) => r.in_progress);
  const rest = all.filter((r) => !r.in_progress);

  return NextResponse.json({
    continuing,
    series: rest,
    all,
  });
}
