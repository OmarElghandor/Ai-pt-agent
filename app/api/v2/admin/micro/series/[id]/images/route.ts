import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2MicroSeriesModel } from '@/lib/v2/mongo/microModels';
import { enqueueMicroSeriesImages } from '@/lib/v2/micro/images/enqueue';
import { generateMicroSeriesMainImages } from '@/lib/v2/micro/images/generateMains';
import { applySceneBoxesToSeries } from '@/lib/v2/micro/images/visionBoxes';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    force?: boolean;
    sync_mains?: boolean;
  };
  await connectMongo();
  const series = await V2MicroSeriesModel().findById(id).lean();
  if (!series) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const seriesId = String(series._id);
  const force = Boolean(body.force);
  const result = await enqueueMicroSeriesImages({
    seriesId,
    seriesSlug: series.slug,
    targetLang: series.target_lang,
    force,
  });
  let mains: Awaited<ReturnType<typeof generateMicroSeriesMainImages>> | null =
    null;
  if (body.sync_mains !== false) {
    mains = await generateMicroSeriesMainImages({
      seriesId,
      seriesSlug: series.slug,
      targetLang: series.target_lang,
      force,
    });
  }
  const boxes = await applySceneBoxesToSeries({ seriesId, force });
  return NextResponse.json({
    ok: true,
    ...result,
    mains,
    boxes,
  });
}
