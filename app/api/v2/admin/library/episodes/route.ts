import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { mongoConfigured } from '@/lib/mongo';
import { listEpisodes, parseEpisodeFilters } from '@/lib/v2/library/listEpisodes';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const filters = parseEpisodeFilters(new URL(req.url).searchParams);
  const episodes = await listEpisodes(filters);
  return NextResponse.json({ episodes });
}
