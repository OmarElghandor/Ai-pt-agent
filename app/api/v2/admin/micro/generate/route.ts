import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { mongoConfigured } from '@/lib/mongo';
import { generateMicroClip } from '@/lib/v2/micro/generate';
import { loadMicroOutline, findOutlineClip } from '@/lib/v2/micro/outline';
import { ensureMicroSeries, persistGeneratedClip } from '@/lib/v2/micro/persist';
import { enqueueMicroSeriesImages } from '@/lib/v2/micro/images/enqueue';
import { generateMicroSeriesMainImages } from '@/lib/v2/micro/images/generateMains';
import { publishMicroClip } from '@/lib/v2/micro/publish';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }

  const body = (await req.json()) as {
    series_slug?: string;
    clip_slug?: string;
    bulk_series?: string;
    enqueue_images?: boolean;
  };
  const enqueueImages = body.enqueue_images !== false;

  const outline = loadMicroOutline();

  if (body.bulk_series) {
    const series = outline.series.find((s) => s.slug === body.bulk_series);
    if (!series) {
      return NextResponse.json({ error: 'series not found' }, { status: 404 });
    }
    const seriesId = await ensureMicroSeries(series, outline.target_lang);
    const results = [];
    for (const clip of series.clips) {
      const result = await generateMicroClip({ series, clip });
      if (result.ok) {
        const id = await persistGeneratedClip({
          seriesId,
          seriesSlug: series.slug,
          clip,
          targetLang: outline.target_lang,
          result,
        });
        await publishMicroClip(id);
        results.push({ clip: clip.slug, ok: true, id });
      } else {
        results.push({
          clip: clip.slug,
          ok: false,
          reason: result.reason,
          lines: result.lines.length,
        });
      }
    }
    let images: Awaited<ReturnType<typeof enqueueMicroSeriesImages>> | null =
      null;
    let mains: Awaited<ReturnType<typeof generateMicroSeriesMainImages>> | null =
      null;
    if (enqueueImages && results.some((r) => r.ok)) {
      images = await enqueueMicroSeriesImages({
        seriesId,
        seriesSlug: series.slug,
        targetLang: outline.target_lang,
      });
      mains = await generateMicroSeriesMainImages({
        seriesId,
        seriesSlug: series.slug,
        targetLang: outline.target_lang,
      });
    }
    return NextResponse.json({ series_id: seriesId, results, images, mains });
  }

  if (!body.series_slug || !body.clip_slug) {
    return NextResponse.json(
      { error: 'series_slug and clip_slug required' },
      { status: 400 },
    );
  }
  const found = findOutlineClip(outline, body.series_slug, body.clip_slug);
  if (!found) {
    return NextResponse.json({ error: 'clip not found in outline' }, { status: 404 });
  }
  const seriesId = await ensureMicroSeries(found.series, outline.target_lang);
  const result = await generateMicroClip({
    series: found.series,
    clip: found.clip,
  });
  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      reason: result.reason,
      message: result.message,
      lines: result.lines,
      top_up_called: result.top_up_called,
      model_calls: result.model_calls,
      cost_tokens: result.cost_tokens,
    });
  }
  const id = await persistGeneratedClip({
    seriesId,
    seriesSlug: found.series.slug,
    clip: found.clip,
    targetLang: outline.target_lang,
    result,
  });
  await publishMicroClip(id);
  let images: Awaited<ReturnType<typeof enqueueMicroSeriesImages>> | null =
    null;
  let mains: Awaited<ReturnType<typeof generateMicroSeriesMainImages>> | null =
    null;
  if (enqueueImages) {
    images = await enqueueMicroSeriesImages({
      seriesId,
      seriesSlug: found.series.slug,
      targetLang: outline.target_lang,
    });
    mains = await generateMicroSeriesMainImages({
      seriesId,
      seriesSlug: found.series.slug,
      targetLang: outline.target_lang,
    });
  }
  return NextResponse.json({ ok: true, clip_id: id, result, images, mains });
}
