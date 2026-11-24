import { NextResponse } from 'next/server';
import { getCurrentV2User } from '@/lib/v2/auth/session';
import { mongoConfigured } from '@/lib/mongo';
import { isV2Enabled } from '@/lib/v2/flags';
import {
  getOrCreateTodayReview,
  peekTodayReview,
} from '@/lib/v2/practice/reviewStore';
import {
  dayOverrideFromSearch,
  DEFAULT_TARGET_LANG,
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
  const user = await getCurrentV2User();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const userId = user.id;
  const target_lang = user.target_lang || DEFAULT_TARGET_LANG;

  const url = new URL(req.url);
  const currentDay = await resolveLearnerDay(
    userId,
    url.searchParams.has('day')
      ? dayOverrideFromSearch(url.searchParams.get('day'))
      : null,
    target_lang,
  );
  const tz =
    req.headers.get('x-timezone') ??
    url.searchParams.get('tz') ??
    'UTC';

  // Tab-bar dot: never build a session
  if (url.searchParams.get('peek') === '1') {
    const peek = await peekTodayReview({
      user_id: userId,
      currentDay,
      timeZone: tz,
      target_lang,
    });
    return NextResponse.json({ ...peek, current_day: currentDay });
  }

  const session = await getOrCreateTodayReview({
    user_id: userId,
    currentDay,
    timeZone: tz,
    target_lang,
  });

  return NextResponse.json({
    ...session,
    current_day: currentDay,
  });
}
