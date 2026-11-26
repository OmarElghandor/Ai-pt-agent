import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2MicroClipModel } from '@/lib/v2/mongo/microModels';
import { getImageByKey } from '@/lib/v2/images/generateOne';

export const runtime = 'nodejs';

/** M8 · صدّر كريل — Remotion payload (no faces / lip-sync). */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const { id } = await ctx.params;
  await connectMongo();
  const clip = await V2MicroClipModel().findById(id).lean();
  if (!clip) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (clip.status !== 'published') {
    return NextResponse.json({ error: 'clip must be published' }, { status: 400 });
  }

  const main = clip.main_image_key
    ? await getImageByKey(clip.main_image_key)
    : null;

  const lines = [];
  for (const line of clip.lines ?? []) {
    const icon = line.icon_key ? await getImageByKey(line.icon_key) : null;
    // Timings: placeholder ~2.2s audio + 1.5s reveal hold (Remotion can replace with real durations)
    const audioDurationMs = Math.max(1200, line.tl.split(/\s+/).length * 350);
    lines.push({
      tl: line.tl,
      ar: line.ar,
      icon_url: icon?.url ?? null,
      audio_url: null as string | null,
      audio_duration_ms: audioDurationMs,
      reveal_hold_ms: 1500,
      box: line.box
        ? { x: line.box.x, y: line.box.y, w: line.box.w, h: line.box.h }
        : null,
      highlight: line.highlight ?? null,
    });
  }

  return NextResponse.json({
    format: 'az-talkie-micro-reel-v1',
    aspect: '9:16',
    layout: clip.layout,
    title_tl: clip.title_tl,
    title_ar: clip.title_ar,
    note: clip.note ?? null,
    level: clip.level,
    rule_card: clip.rule_card ?? null,
    main_image_url: main?.url ?? null,
    main_image_aspect: clip.main_image_aspect ?? '4:3',
    lines,
    end_card: { app_name: 'A-Z Talkie', short_name: 'Talkie' },
  });
}
