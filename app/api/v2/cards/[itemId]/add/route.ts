import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/currentUser';
import { mongoConfigured } from '@/lib/mongo';
import { getPublishedLesson, getLatestLessonPack } from '@/lib/v2/content/getPublishedLesson';
import { isV2Enabled } from '@/lib/v2/flags';
import { addUserCard } from '@/lib/v2/progress/cardsStore';
import { resolveLearnerDay } from '@/lib/v2/progress/learnerDay';

export const runtime = 'nodejs';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ itemId: string }> },
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

  const { itemId } = await ctx.params;
  if (!itemId) {
    return NextResponse.json({ error: 'item_id required' }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as {
    day?: number;
  } | null;
  const currentDay = await resolveLearnerDay(
    userId,
    typeof body?.day === 'number' ? body.day : null,
  );

  // Resolve item from published/latest pack for that day (or any day ≤ current).
  let foundDay = currentDay;
  let found = false;
  for (let d = currentDay; d >= 1 && !found; d--) {
    const pack =
      (await getPublishedLesson(d)) ?? (await getLatestLessonPack(d));
    if (!pack) continue;
    if (pack.pack.items.some((i) => i.id === itemId)) {
      found = true;
      foundDay = d;
    }
  }
  if (!found) {
    return NextResponse.json({ error: 'item_not_found' }, { status: 404 });
  }

  const result = await addUserCard({
    user_id: userId,
    item_id: itemId,
    introducedDay: foundDay,
  });
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    created: result.created,
    item_id: itemId,
    opt_in_card: true,
  });
}
