import { NextResponse } from 'next/server';
import { getCurrentV2User } from '@/lib/v2/auth/session';
import { isV2Enabled } from '@/lib/v2/flags';
import { mongoConfigured } from '@/lib/mongo';
import { getOrPickDailyClip } from '@/lib/v2/micro/daily';
import { userLocalDate } from '@/lib/v2/progress/userLocalDate';
import { learnerCurrentDay } from '@/lib/v2/progress/learnerDay';
import { loadKnownItemMap } from '@/lib/v2/generation/lesson/registry';

export const runtime = 'nodejs';

export async function GET() {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  const user = await getCurrentV2User();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }

  const localDate = userLocalDate(user.timezone);
  const lessonItemIds: string[] = [];
  try {
    const day = await learnerCurrentDay(user.id);
    const known = await loadKnownItemMap({ day: day + 2, targetLang: 'pt-PT' });
    for (const item of known.values()) {
      lessonItemIds.push(item.id);
    }
  } catch {
    /* picker still works with empty overlap */
  }

  const pick = await getOrPickDailyClip({
    userId: user.id,
    localDate,
    lessonItemIds: [...new Set(lessonItemIds)].slice(0, 200),
  });
  return NextResponse.json({ local_date: localDate, clip: pick });
}
