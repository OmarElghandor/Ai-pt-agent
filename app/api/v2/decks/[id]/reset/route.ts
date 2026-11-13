import { NextResponse } from 'next/server';
import { getCurrentV2UserId } from '@/lib/v2/auth/session';
import { mongoConfigured } from '@/lib/mongo';
import { resetDeck } from '@/lib/v2/decks/reset';
import { isV2Enabled } from '@/lib/v2/flags';
import {
  dayOverrideFromSearch,
  resolveLearnerDay,
} from '@/lib/v2/progress/learnerDay';

export const runtime = 'nodejs';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
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

  const { id } = await ctx.params;
  const url = new URL(req.url);
  const currentDay = await resolveLearnerDay(
    userId,
    url.searchParams.has('day')
      ? dayOverrideFromSearch(url.searchParams.get('day'))
      : null,
  );
  const tz =
    url.searchParams.get('tz') ??
    req.headers.get('x-timezone') ??
    undefined;

  const result = await resetDeck({
    user_id: userId,
    deckId: decodeURIComponent(id),
    currentDay,
    timeZone: tz,
  });
  if (!result.ok) {
    const status = result.reason === 'not_found' ? 404 : 503;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
