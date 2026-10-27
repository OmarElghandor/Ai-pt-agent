import { NextResponse, after } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import {
  enqueueGenerateLesson,
  runWorkerUntilIdle,
} from '@/lib/v2/generation/jobs';
import { mongoConfigured } from '@/lib/mongo';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Enqueue lesson-generation DAG and drain ready jobs after the response
 * (via next/server `after`). Client polls GET …/generation for graph progress.
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
    const enqueued = await enqueueGenerateLesson({ day });
    const workerId = `admin-${process.pid}-${Date.now().toString(36)}`;

    after(async () => {
      try {
        // Leave headroom under maxDuration=300s for the drain loop.
        const n = await runWorkerUntilIdle(workerId, {
          maxEmptyRounds: 3,
          idleMs: 2000,
          deadlineMs: 280_000,
        });
        console.info(
          '[v2-admin generate] drain done',
          enqueued.lesson_id,
          `processed=${n}`,
        );
      } catch (err) {
        console.error(
          '[v2-admin generate] drain failed',
          enqueued.lesson_id,
          err instanceof Error ? err.message : err,
        );
      }
    });

    return NextResponse.json({
      queued: true,
      started: true,
      jobId: enqueued.jobId,
      jobIds: enqueued.jobIds,
      day: enqueued.day,
      version: enqueued.version,
      target_lang: enqueued.target_lang,
      lesson_id: enqueued.lesson_id,
      message: 'DAG enqueued. Poll /generation for job graph progress.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[v2-admin generate]', day, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
