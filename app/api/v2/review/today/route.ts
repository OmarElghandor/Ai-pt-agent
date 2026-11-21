import { NextResponse } from 'next/server';
import { getCurrentV2UserId } from '@/lib/v2/auth/session';
import { mongoConfigured } from '@/lib/mongo';
import { isV2Enabled } from '@/lib/v2/flags';
import { getOrCreateTodayReview } from '@/lib/v2/practice/reviewStore';
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
  const userId = await getCurrentV2UserId();
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

  const session = await getOrCreateTodayReview({
    user_id: userId,
    currentDay,
    timeZone: tz,
  });

  return NextResponse.json({
    ...session,
    current_day: currentDay,
  });
}
