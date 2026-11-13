import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { mongoConfigured } from '@/lib/mongo';
import {
  enqueueCustomDeckImages,
  planDeckImages,
} from '@/lib/v2/decks/images';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const { id } = await ctx.params;
  const plan = await planDeckImages({ deckId: decodeURIComponent(id) });
  if (!plan) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({
    deck_id: plan.deck_id,
    missing_count: plan.missing.length,
    reusable_count: plan.reusable.length,
    skipped_phrases: plan.skipped_phrases,
    estimate_usd: plan.estimate_usd,
    images_status: plan.images_status,
    missing_keys: plan.missing.map((m) => m.key),
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as {
    force?: boolean;
    confirm_over_cap?: boolean;
    item_id?: string;
  } | null;

  const result = await enqueueCustomDeckImages({
    deckId: decodeURIComponent(id),
    admin: true,
    force: Boolean(body?.force),
    confirmOverCap: Boolean(body?.confirm_over_cap),
    itemId: body?.item_id,
  });
  if (!result.ok) {
    const status =
      result.reason === 'not_found' || result.reason === 'item_not_found'
        ? 404
        : result.reason === 'needs_confirm_over_cap'
          ? 409
          : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
