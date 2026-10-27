import { NextResponse, after } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import {
  getLatestJobsForDay,
  requeueStale,
  runWorkerUntilIdle,
} from '@/lib/v2/generation/jobs';
import { mongoConfigured } from '@/lib/mongo';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ day: string }> },
) {
  const denied = denyUnlessV2Admin();
  if (denied) return denied;

  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }

  const { day: dayRaw } = await ctx.params;
  const day = Number(dayRaw);
  if (!Number.isInteger(day) || day < 1 || day > 90) {
    return NextResponse.json({ error: 'invalid day' }, { status: 400 });
  }

  let version: number | undefined;
  try {
    const body = (await req.json().catch(() => ({}))) as { version?: number };
    version = body.version;
  } catch {
    /* empty body ok */
  }

  try {
    const jobs = await getLatestJobsForDay(day);
    const v = version ?? jobs[0]?.version;
    if (v == null) {
      return NextResponse.json({ error: 'no jobs for day' }, { status: 404 });
    }

    const count = await requeueStale(day, v);
    const workerId = `admin-stale-${process.pid}-${Date.now().toString(36)}`;
    after(async () => {
      try {
        const n = await runWorkerUntilIdle(workerId, {
          maxEmptyRounds: 3,
          idleMs: 2000,
          deadlineMs: 280_000,
        });
        console.info(
          '[v2-admin rerun-stale] drain done',
          day,
          `processed=${n}`,
        );
      } catch (err) {
        console.error(
          '[v2-admin rerun-stale]',
          day,
          err instanceof Error ? err.message : err,
        );
      }
    });

    return NextResponse.json({
      ok: true,
      day,
      version: v,
      requeued: count,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
