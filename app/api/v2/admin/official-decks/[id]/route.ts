import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { mongoConfigured } from '@/lib/mongo';
import { connectMongo } from '@/lib/mongo';
import { V2OfficialDeckModel } from '@/lib/v2/mongo/models';
import {
  editCustomItemText,
  publishOfficialDeck,
  updateOfficialDraft,
} from '@/lib/v2/decks/promote';
import { enqueueDeckImages } from '@/lib/v2/decks/images';

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
  await connectMongo();
  const { id } = await ctx.params;
  const deck = await V2OfficialDeckModel().findById(id).lean();
  if (!deck) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({
    id: String(deck._id),
    title_tl: deck.title_tl,
    title_ar: deck.title_ar,
    item_ids: deck.item_ids ?? [],
    status: deck.status,
    source_deck: deck.source_deck ?? null,
  });
}

export async function PATCH(
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
    action?: string;
    title_tl?: string;
    title_ar?: string;
    item_ids?: string[];
    item_id?: string;
    tl?: string;
    ar?: string;
  } | null;

  if (body?.action === 'update') {
    const ok = await updateOfficialDraft({
      official_id: id,
      title_tl: body.title_tl,
      title_ar: body.title_ar,
      item_ids: body.item_ids,
    });
    return NextResponse.json({ ok });
  }
  if (body?.action === 'edit_item' && body.item_id) {
    const ok = await editCustomItemText({
      item_id: body.item_id,
      tl: body.tl,
      ar: body.ar,
    });
    return NextResponse.json({ ok });
  }
  if (body?.action === 'images') {
    const result = await enqueueDeckImages(id);
    return NextResponse.json(result);
  }
  if (body?.action === 'publish') {
    const result = await publishOfficialDeck(id);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  }
  return NextResponse.json({ error: 'bad request' }, { status: 400 });
}
