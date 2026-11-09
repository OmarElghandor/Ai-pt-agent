import { NextResponse } from 'next/server';
import { getCurrentV2UserId } from '@/lib/v2/auth/session';
import { mongoConfigured } from '@/lib/mongo';
import { addCustomCorrectionCard } from '@/lib/v2/convo/correction';
import { isV2Enabled } from '@/lib/v2/flags';

export const runtime = 'nodejs';

/** POST { tl, ar?, day? } — opt-in a synthetic conversation correction card. */
export async function POST(req: Request) {
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

  const body = (await req.json().catch(() => null)) as {
    tl?: string;
    ar?: string;
    day?: number;
  } | null;
  const tl = body?.tl?.trim();
  if (!tl) {
    return NextResponse.json({ error: 'tl required' }, { status: 400 });
  }

  const result = await addCustomCorrectionCard({
    userId,
    tl,
    ar: body?.ar?.trim(),
    day: typeof body?.day === 'number' ? body.day : undefined,
  });
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({
    ok: true,
    item_id: result.item_id,
    created: result.created,
    opt_in_card: true,
  });
}
