import { NextResponse } from 'next/server';
import { getCurrentV2UserId } from '@/lib/v2/auth/session';
import { mongoConfigured } from '@/lib/mongo';
import { listPublishedEpisodes } from '@/lib/v2/library/publish';
import { isV2Enabled } from '@/lib/v2/flags';

export const runtime = 'nodejs';

export async function GET() {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const userId = await getCurrentV2UserId();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const episodes = await listPublishedEpisodes();
  return NextResponse.json({ episodes });
}
