import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { mongoConfigured } from '@/lib/mongo';
import { rebuildAllUserLevels } from '@/lib/v2/practice/levelJob';

export const runtime = 'nodejs';

/** Nightly / manual rebuild of all user levels + question stats. */
export async function POST(req: Request) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const body = (await req.json().catch(() => ({}))) as { limit?: number };
  const result = await rebuildAllUserLevels({ limit: body.limit });
  return NextResponse.json({ ok: true, ...result });
}
