import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/currentUser';
import { mongoConfigured } from '@/lib/mongo';
import { buildDecksListing } from '@/lib/v2/decks';
import { isV2Enabled } from '@/lib/v2/flags';
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

  const listing = await buildDecksListing({
    user_id: userId,
    currentDay,
  });

  return NextResponse.json(listing);
}
