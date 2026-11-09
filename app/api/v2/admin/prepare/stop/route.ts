import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import {
  listActivePrepareRanges,
  requestPrepareRangeStop,
} from '@/lib/v2/generation/prepare/range';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as {
    run_id?: string;
  } | null;

  const runId = body?.run_id?.trim();
  if (runId) {
    const ok = requestPrepareRangeStop(runId);
    return NextResponse.json({ stopped: ok, run_id: runId });
  }

  const active = listActivePrepareRanges();
  let n = 0;
  for (const r of active) {
    if (requestPrepareRangeStop(r.run_id)) n += 1;
  }
  return NextResponse.json({ stopped: n > 0, count: n });
}
