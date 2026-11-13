import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import {
  deleteCustomDeck,
  removeWordFromDeck,
  setDeckVisibility,
} from '@/lib/v2/decks/admin';
import { mongoConfigured } from '@/lib/mongo';

export const runtime = 'nodejs';

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
    visibility?: 'public' | 'hidden';
    item_id?: string;
  } | null;

  if (body?.action === 'visibility' && body.visibility) {
    const ok = await setDeckVisibility(id, body.visibility);
    return NextResponse.json({ ok });
  }
  if (body?.action === 'remove_word' && body.item_id) {
    const ok = await removeWordFromDeck(id, body.item_id);
    return NextResponse.json({ ok });
  }
  if (body?.action === 'delete') {
    const ok = await deleteCustomDeck(id);
    return NextResponse.json({ ok });
  }
  return NextResponse.json({ error: 'bad request' }, { status: 400 });
}
