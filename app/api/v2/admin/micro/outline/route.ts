import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import {
  countOutlineClips,
  defaultOutlinePath,
  listOutlineSeries,
  loadMicroOutline,
  MicroOutlineError,
} from '@/lib/v2/micro/outline';

export const runtime = 'nodejs';

/** Read-only list of the authored micro outline (19 M1). */
export async function GET(req: Request) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;

  const lang =
    new URL(req.url).searchParams.get('lang')?.trim() || 'pt-PT';

  try {
    const outline = loadMicroOutline(defaultOutlinePath(lang));
    const series = listOutlineSeries(outline).map((s) => ({
      slug: s.slug,
      order: s.order,
      title_ar: s.title_ar,
      title_tl: s.title_tl,
      clip_count: s.clips.length,
      clips: s.clips
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((c) => ({
          slug: c.slug,
          order: c.order,
          layout: c.layout,
          level: c.level,
          title_ar: c.title_ar,
          title_tl: c.title_tl,
          legacy_ref: c.legacy_ref ?? null,
          ready: c.ready ?? false,
          has_authored_lines: Boolean(c.authored_lines?.length),
        })),
    }));
    return NextResponse.json({
      target_lang: outline.target_lang,
      series_count: series.length,
      clip_count: countOutlineClips(outline),
      series,
    });
  } catch (err) {
    if (err instanceof MicroOutlineError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    throw err;
  }
}
