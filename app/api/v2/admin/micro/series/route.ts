import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { loadMicroOutline } from '@/lib/v2/micro/outline';
import {
  V2MicroClipModel,
  V2MicroSeriesModel,
} from '@/lib/v2/mongo/microModels';

export const runtime = 'nodejs';

/** Admin: outline + DB series/clips status. */
export async function GET() {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  await connectMongo();
  const outline = loadMicroOutline();
  const series = await V2MicroSeriesModel()
    .find({ target_lang: outline.target_lang })
    .sort({ order: 1 })
    .lean();
  const clips = await V2MicroClipModel()
    .find({ target_lang: outline.target_lang })
    .sort({ order: 1 })
    .lean();

  const db = series.map((s) => {
    const sc = clips.filter((c) => c.series_id === String(s._id));
    return {
      id: String(s._id),
      slug: s.slug,
      title_ar: s.title_ar,
      title_tl: s.title_tl,
      order: s.order,
      status: s.status,
      official_deck_id: s.official_deck_id ?? null,
      clips: sc.map((c) => ({
        id: String(c._id),
        slug: c.slug,
        order: c.order,
        layout: c.layout,
        level: c.level,
        title_ar: c.title_ar,
        title_tl: c.title_tl,
        status: c.status,
        line_count: c.lines?.length ?? 0,
        generation_tokens: c.generation_tokens ?? 0,
        main_image_key: c.main_image_key ?? null,
        draft_reason: c.draft_reason ?? null,
      })),
    };
  });

  return NextResponse.json({
    target_lang: outline.target_lang,
    outline_series: outline.series.map((s) => ({
      slug: s.slug,
      order: s.order,
      title_ar: s.title_ar,
      title_tl: s.title_tl,
      clip_count: s.clips.length,
    })),
    series: db,
  });
}
