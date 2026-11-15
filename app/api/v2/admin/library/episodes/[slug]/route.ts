import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { mongoConfigured } from '@/lib/mongo';
import { getEpisodeWithBrief } from '@/lib/v2/library/listEpisodes';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const { slug } = await ctx.params;
  const v = Number(new URL(req.url).searchParams.get('version'));
  const found = await getEpisodeWithBrief(slug, {
    version: Number.isInteger(v) && v > 0 ? v : undefined,
  });
  if (!found) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({
    episode: found.episode ? JSON.parse(JSON.stringify(found.episode)) : null,
    brief: found.brief ? JSON.parse(JSON.stringify(found.brief)) : null,
  });
}
