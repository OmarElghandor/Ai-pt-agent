import { NextResponse } from 'next/server';
import { getCurrentV2UserId } from '@/lib/v2/auth/session';
import { mongoConfigured } from '@/lib/mongo';
import { listPublicLearnerDecks } from '@/lib/v2/decks/public';
import { isV2Enabled } from '@/lib/v2/flags';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const userId = await getCurrentV2UserId();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const sort = url.searchParams.get('sort') === 'new' ? 'new' : 'popular';
  const q = url.searchParams.get('q') ?? undefined;
  const page = Number(url.searchParams.get('page') ?? '1');

  const result = await listPublicLearnerDecks({ sort, q, page });
  return NextResponse.json(result);
}
