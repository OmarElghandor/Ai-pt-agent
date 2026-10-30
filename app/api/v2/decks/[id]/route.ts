import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/currentUser';
import { mongoConfigured } from '@/lib/mongo';
import { getDeckDetail } from '@/lib/v2/decks';
import { isV2Enabled } from '@/lib/v2/flags';
import {
  dayOverrideFromSearch,
  resolveLearnerDay,
} from '@/lib/v2/progress/learnerDay';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
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

  const { id } = await ctx.params;
  const url = new URL(req.url);
  const currentDay = await resolveLearnerDay(
    userId,
    url.searchParams.has('day')
      ? dayOverrideFromSearch(url.searchParams.get('day'))
      : null,
  );

  const detail = await getDeckDetail({
    user_id: userId,
    deckId: decodeURIComponent(id),
    currentDay,
  });
  if (!detail) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json(detail);
}
