import { NextResponse } from 'next/server';
import { getCurrentV2UserId } from '@/lib/v2/auth/session';
import { mongoConfigured } from '@/lib/mongo';
import { reportCustomDeck, type ReportReason } from '@/lib/v2/decks/reports';
import { isV2Enabled } from '@/lib/v2/flags';

export const runtime = 'nodejs';

const REASONS = new Set([
  'wrong_word',
  'brazilian',
  'offensive',
  'other',
  'wrong_picture',
]);

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
  const body = (await req.json().catch(() => null)) as {
    reason?: string;
    item_id?: string;
  } | null;
  if (!body?.reason || !REASONS.has(body.reason)) {
    return NextResponse.json({ error: 'reason required' }, { status: 400 });
  }
  if (body.reason === 'wrong_picture' && !body.item_id?.trim()) {
    return NextResponse.json(
      { error: 'item_id required for wrong_picture' },
      { status: 400 },
    );
  }

  const result = await reportCustomDeck({
    user_id: userId,
    deck_id: decodeURIComponent(id),
    reason: body.reason as ReportReason,
    item_id: body.item_id,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: 404 });
  }
  return NextResponse.json(result);
}
