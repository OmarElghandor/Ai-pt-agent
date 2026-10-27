import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/currentUser';
import { mongoConfigured } from '@/lib/mongo';
import { getPublishedLesson } from '@/lib/v2/content/getPublishedLesson';
import { isV2Enabled } from '@/lib/v2/flags';
import { getOrCreateTodayCards } from '@/lib/v2/progress/cardsStore';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const userId = getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const dayParam = Number(url.searchParams.get('day') ?? '1');
  const currentDay =
    Number.isFinite(dayParam) && dayParam >= 1 ? Math.floor(dayParam) : 1;
  const tz =
    req.headers.get('x-timezone') ??
    url.searchParams.get('tz') ??
    'UTC';

  const published = await getPublishedLesson(currentDay);
  const session = await getOrCreateTodayCards({
    user_id: userId,
    currentDay,
    timeZone: tz,
    items: published?.pack.items,
  });

  return NextResponse.json({
    local_date: session.local_date,
    status: session.status,
    cards: session.queue.map((q) => ({
      item_id: q.item_id,
      bucket: q.bucket,
      rating: q.rating ?? null,
    })),
    // Never expose backlog count
  });
}
