import { NextResponse, after } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import {
  enqueueStoryRegen,
  runWorkerUntilIdle,
} from '@/lib/v2/generation/jobs';
import { mongoConfigured } from '@/lib/mongo';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Requeue only the story job, then drain the worker.
 * Never re-runs outline/pages/questions; success re-links page 0 + replay.
 */
export async function POST(
  _req: Request,
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

  try {
    const enqueued = await enqueueStoryRegen({ day });
    const workerId = `admin-story-${process.pid}-${Date.now().toString(36)}`;

    after(async () => {
      try {
        const n = await runWorkerUntilIdle(workerId, {
          maxEmptyRounds: 3,
          idleMs: 2000,
          deadlineMs: 280_000,
        });
        console.info(
          '[v2-admin generate story] drain done',
          `day=${enqueued.day}`,
          `v${enqueued.version}`,
          `processed=${n}`,
        );
      } catch (err) {
        console.error(
          '[v2-admin generate story] drain failed',
          day,
          err instanceof Error ? err.message : err,
        );
      }
    });

    return NextResponse.json({
      ok: true,
      day: enqueued.day,
      version: enqueued.version,
      jobId: enqueued.storyJobId,
      message: `Story regenerating for day ${day} v${enqueued.version}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[v2-admin generate story]', day, message);
    const status =
      /required|empty|missing|No jobs|No lesson|first|must be done/i.test(
        message,
      )
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
