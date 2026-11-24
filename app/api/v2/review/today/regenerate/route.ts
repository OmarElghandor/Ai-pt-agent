import { NextResponse } from 'next/server';
import { getCurrentV2User } from '@/lib/v2/auth/session';
import { mongoConfigured } from '@/lib/mongo';
import { isV2Enabled } from '@/lib/v2/flags';
import { getOrCreateTodayReview } from '@/lib/v2/practice/reviewStore';
import { canRegenerateReview } from '@/lib/v2/practice/regenerate';
import {
  dayOverrideFromSearch,
  DEFAULT_TARGET_LANG,
  resolveLearnerDay,
} from '@/lib/v2/progress/learnerDay';

export const runtime = 'nodejs';

/**
 * Testing: rebuild today's review from scratch (new mix, fresh coverage
 * plans, no 3-day no-repeat). Admins anywhere; everyone outside production.
 * Answers already logged stay in v2_answers.
 */
export async function POST(req: Request) {
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
  if (!canRegenerateReview(user.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const target_lang = user.target_lang || DEFAULT_TARGET_LANG;
  const url = new URL(req.url);
  const currentDay = await resolveLearnerDay(
    user.id,
    url.searchParams.has('day')
      ? dayOverrideFromSearch(url.searchParams.get('day'))
      : null,
    target_lang,
  );
  const tz = req.headers.get('x-timezone') ?? url.searchParams.get('tz') ?? 'UTC';

  const session = await getOrCreateTodayReview({
    user_id: user.id,
    currentDay,
    timeZone: tz,
    target_lang,
    regenerate: true,
  });
  return NextResponse.json({ ...session, current_day: currentDay });
}
