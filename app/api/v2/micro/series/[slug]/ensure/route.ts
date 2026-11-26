import { NextResponse } from 'next/server';
import { getCurrentV2UserId } from '@/lib/v2/auth/session';
import { isV2Enabled } from '@/lib/v2/flags';
import { mongoConfigured } from '@/lib/mongo';
import {
  ensureMicroSeriesContent,
  isSeriesEnsuring,
} from '@/lib/v2/micro/ensure';

export const runtime = 'nodejs';
/** Long-running generate for a whole series. */
export const maxDuration = 300;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  const userId = await getCurrentV2UserId();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }

  const { slug } = await ctx.params;

  if (isSeriesEnsuring('pt-PT', slug)) {
    return NextResponse.json({
      status: 'generating',
      series_slug: slug,
      clip_count: 0,
      ready_count: 0,
      generated: 0,
    });
  }

  // Fire ensure — may take a while; client polls GET status via same endpoint GET or re-POST
  const result = await ensureMicroSeriesContent({ seriesSlug: slug });
  const status =
    result.status === 'ready'
      ? 200
      : result.status === 'generating'
        ? 202
        : 422;
  return NextResponse.json(result, { status });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  const userId = await getCurrentV2UserId();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { slug } = await ctx.params;
  if (isSeriesEnsuring('pt-PT', slug)) {
    return NextResponse.json({
      status: 'generating',
      series_slug: slug,
    });
  }
  // Lightweight ready check
  const { connectMongo } = await import('@/lib/mongo');
  const { V2MicroSeriesModel, V2MicroClipModel } = await import(
    '@/lib/v2/mongo/microModels'
  );
  await connectMongo();
  const series = await V2MicroSeriesModel()
    .findOne({ slug, target_lang: 'pt-PT' })
    .lean();
  if (!series) {
    return NextResponse.json({ status: 'missing', series_slug: slug });
  }
  const ready = await V2MicroClipModel().countDocuments({
    series_id: String(series._id),
    status: { $in: ['ready', 'published'] },
  });
  return NextResponse.json({
    status: ready > 0 ? 'ready' : 'missing',
    series_slug: slug,
    series_id: String(series._id),
    ready_count: ready,
  });
}
