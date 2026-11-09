import { NextResponse } from 'next/server';
import { isV2DevAllowed, isV2Enabled } from '@/lib/v2/flags';
import {
  ensureLessonDayGoalBank,
  listCachedLessonDayBanks,
} from '@/lib/v2/convo/goals';

export const runtime = 'nodejs';

/** List + generate cached lesson-day goal banks (F5, days 2–5). */
export async function GET() {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  if (!isV2DevAllowed()) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const items = await listCachedLessonDayBanks();
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  if (!isV2DevAllowed()) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as {
    day?: number;
    days?: number[];
    force?: boolean;
  } | null;

  const days =
    Array.isArray(body?.days) && body!.days!.length
      ? body!.days!.filter((d) => Number.isInteger(d) && d >= 2 && d <= 5)
      : typeof body?.day === 'number' &&
          Number.isInteger(body.day) &&
          body.day >= 2 &&
          body.day <= 5
        ? [body.day]
        : [2, 3, 4, 5];

  const results = [];
  for (const day of days) {
    const out = await ensureLessonDayGoalBank({
      day,
      force: Boolean(body?.force),
    });
    results.push({
      day,
      fromCache: out.fromCache,
      source: out.source,
      title_tl: out.bank.title_tl,
      title_ar: out.bank.title_ar,
      goal_count: out.bank.goals.length,
    });
  }
  return NextResponse.json({ results });
}
