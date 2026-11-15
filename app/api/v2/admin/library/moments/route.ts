import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { mongoConfigured } from '@/lib/mongo';
import { createMoment, listMoments } from '@/lib/v2/library/moments';
import { libraryErrorResponse } from '@/lib/v2/library/routeErrors';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const sp = new URL(req.url).searchParams;
  const place = sp.get('place')?.trim() || undefined;
  const includeArchived = sp.get('archived') === '1';
  return NextResponse.json(await listMoments({ place, includeArchived }));
}

export async function POST(req: Request) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  let body: { place?: unknown; eg?: unknown; must_say?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  try {
    const moment = await createMoment(body);
    return NextResponse.json({ moment }, { status: 201 });
  } catch (e) {
    return libraryErrorResponse(e);
  }
}
