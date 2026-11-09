import { NextResponse } from 'next/server';
import { getCurrentV2UserId } from '@/lib/v2/auth/session';
import { getDaysReadiness } from '@/lib/v2/generation/prepare';
import { isV2Enabled } from '@/lib/v2/flags';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  const userId = await getCurrentV2UserId();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const targetLang = url.searchParams.get('lang')?.trim() || 'pt-PT';
  const raw = url.searchParams.get('days')?.trim() ?? '';
  if (!raw) {
    return NextResponse.json({ error: 'days required' }, { status: 400 });
  }

  const days = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);

  if (days.length === 0) {
    return NextResponse.json({ error: 'no valid days' }, { status: 400 });
  }
  if (days.length > 60) {
    return NextResponse.json({ error: 'too many days' }, { status: 400 });
  }

  const readiness = await getDaysReadiness(days, targetLang);
  return NextResponse.json({ days: readiness });
}
