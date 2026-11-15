import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { mongoConfigured } from '@/lib/mongo';
import { updateMoment } from '@/lib/v2/library/moments';
import { libraryErrorResponse } from '@/lib/v2/library/routeErrors';

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
  let body: { eg?: unknown; must_say?: unknown; archived?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const { id } = await ctx.params;
  try {
    const moment = await updateMoment(id, body);
    return NextResponse.json({ moment });
  } catch (e) {
    return libraryErrorResponse(e);
  }
}
