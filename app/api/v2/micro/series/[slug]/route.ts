import { NextResponse } from 'next/server';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { getCurrentV2UserId } from '@/lib/v2/auth/session';
import { isV2Enabled } from '@/lib/v2/flags';
import { getImageByKey } from '@/lib/v2/images/generateOne';
import {
  V2MicroClipModel,
  V2MicroProgressModel,
  V2MicroSeriesModel,
} from '@/lib/v2/mongo/microModels';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  const userId = await getCurrentV2UserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const { slug } = await ctx.params;
  await connectMongo();
  const series = await V2MicroSeriesModel()
    .findOne({ slug, target_lang: 'pt-PT' })
    .lean();
  if (!series) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const clips = await V2MicroClipModel()
    .find({
      series_id: String(series._id),
      status: { $in: ['ready', 'published'] },
    })
    .sort({ order: 1 })
    .lean();
  if (!clips.length) {
    return NextResponse.json({ error: 'not ready' }, { status: 404 });
  }
  const progress = await V2MicroProgressModel()
    .find({
      user_id: userId,
      clip_id: { $in: clips.map((c) => String(c._id)) },
    })
    .lean();
  const progByClip = new Map(progress.map((p) => [p.clip_id, p]));

  const out = [];
  for (const c of clips) {
    const main = c.main_image_key
      ? await getImageByKey(c.main_image_key)
      : null;
    const lines = [];
    for (const line of c.lines ?? []) {
      const icon = line.icon_key ? await getImageByKey(line.icon_key) : null;
      lines.push({
        item_id: line.item_id,
        tl: line.tl,
        ar: line.ar,
        icon_url: icon?.url ?? null,
        box: line.box
          ? { x: line.box.x, y: line.box.y, w: line.box.w, h: line.box.h }
          : null,
        region_label: line.region_label ?? null,
        highlight: line.highlight ?? null,
      });
    }
    const p = progByClip.get(String(c._id));
    out.push({
      id: String(c._id),
      slug: c.slug,
      layout: c.layout,
      level: c.level,
      title_tl: c.title_tl,
      title_ar: c.title_ar,
      note: c.note ?? null,
      rule_card: c.rule_card ?? null,
      main_image_url: main?.url ?? null,
      scene_key: c.scene_key ?? null,
      pointer_from: c.pointer_from
        ? { x: c.pointer_from.x, y: c.pointer_from.y }
        : null,
      lines,
      revealed_count: p?.revealed_count ?? 0,
      finished: Boolean(p?.finished_at),
    });
  }

  return NextResponse.json({
    series: {
      id: String(series._id),
      slug: series.slug,
      title_ar: series.title_ar,
      title_tl: series.title_tl,
      official_deck_id: series.official_deck_id ?? null,
    },
    clips: out,
  });
}
