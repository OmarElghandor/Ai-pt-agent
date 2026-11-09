import { NextResponse, after } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { mongoConfigured } from '@/lib/mongo';
import {
  beginPrepareRange,
  listActivePrepareRanges,
  runPrepareDayRange,
} from '@/lib/v2/generation/prepare/range';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET() {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  return NextResponse.json({
    active: listActivePrepareRanges(),
  });
}

export async function POST(req: Request) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as {
    from?: number;
    to?: number;
    concurrency?: number;
  } | null;

  const from = Number(body?.from);
  const to = Number(body?.to);
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 1 ||
    to < 1 ||
    Math.abs(to - from) > 40
  ) {
    return NextResponse.json({ error: 'invalid range' }, { status: 400 });
  }

  const seeded = beginPrepareRange({
    from,
    to,
    concurrency: body?.concurrency ?? 2,
  });
  after(async () => {
    try {
      await runPrepareDayRange({
        from,
        to,
        concurrency: seeded.concurrency,
        runId: seeded.run_id,
      });
    } catch (err) {
      console.error(
        '[v2-admin prepare/range]',
        err instanceof Error ? err.message : err,
      );
    }
  });

  return NextResponse.json({
    queued: true,
    run_id: seeded.run_id,
    progress: seeded,
  });
}
