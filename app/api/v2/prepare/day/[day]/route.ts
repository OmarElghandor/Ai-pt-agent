import { NextResponse } from 'next/server';
import { getCurrentV2UserId } from '@/lib/v2/auth/session';
import { mongoConfigured } from '@/lib/mongo';
import { getDayReadiness } from '@/lib/v2/generation/prepare';
import { isV2Enabled } from '@/lib/v2/flags';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ day: string }> };

export async function GET(req: Request, ctx: Ctx) {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  const userId = await getCurrentV2UserId();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { day: dayRaw } = await ctx.params;
  const day = Number(dayRaw);
  if (!Number.isInteger(day) || day < 1) {
    return NextResponse.json({ error: 'invalid day' }, { status: 400 });
  }

  const url = new URL(req.url);
  const targetLang = url.searchParams.get('lang')?.trim() || 'pt-PT';

  if (!mongoConfigured()) {
    // Still allow authored-file readiness (compute without Mongo jobs).
    const readiness = await getDayReadiness(day, targetLang);
    return NextResponse.json(readiness);
  }

  const readiness = await getDayReadiness(day, targetLang);
  return NextResponse.json(readiness);
}
