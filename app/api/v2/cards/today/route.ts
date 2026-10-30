import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/currentUser';
import { mongoConfigured } from '@/lib/mongo';
import {
  hydrateCardFaces,
  loadPublishedFlashcardsThrough,
} from '@/lib/v2/decks';
import { isV2Enabled } from '@/lib/v2/flags';
import { countQueueAt, getOrCreateTodayCards } from '@/lib/v2/progress/cardsStore';
import { endOfTomorrow } from '@/lib/v2/progress/localDate';
import {
  dayOverrideFromSearch,
  resolveLearnerDay,
} from '@/lib/v2/progress/learnerDay';

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
  const currentDay = await resolveLearnerDay(
    userId,
    url.searchParams.has('day')
      ? dayOverrideFromSearch(url.searchParams.get('day'))
      : null,
  );
  const tz =
    req.headers.get('x-timezone') ??
    url.searchParams.get('tz') ??
    'UTC';

  const { byId } = await loadPublishedFlashcardsThrough(currentDay);
  const items = [...byId.values()];
  const session = await getOrCreateTodayCards({
    user_id: userId,
    currentDay,
    timeZone: tz,
    items,
  });
  const tomorrow = await countQueueAt({
    user_id: userId,
    currentDay,
    now: endOfTomorrow(new Date(), tz),
    items,
  });

  const faces = await hydrateCardFaces(
    session.queue.map((q) => q.item_id),
    currentDay,
  );

  const rated = session.queue.filter((q) => q.rating).length;
  const buckets = { recent: 0, weak: 0, older: 0 };
  for (const q of session.queue) {
    buckets[q.bucket] += 1;
  }

  return NextResponse.json({
    local_date: session.local_date,
    status: session.status,
    current_day: currentDay,
    progress: { rated, total: session.queue.length },
    tomorrow,
    mix: buckets,
    cards: session.queue.map((q) => ({
      item_id: q.item_id,
      bucket: q.bucket,
      rating: q.rating ?? null,
      face: faces.get(q.item_id) ?? null,
    })),
    // Never expose backlog count
  });
}
