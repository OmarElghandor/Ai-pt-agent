import { NextResponse, after } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { requeueJob, runWorkerUntilIdle } from '@/lib/v2/generation/jobs';
import { mongoConfigured } from '@/lib/mongo';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ jobId: string }> },
) {
  const denied = denyUnlessV2Admin();
  if (denied) return denied;

  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }

  const { jobId } = await ctx.params;
  if (!jobId) {
    return NextResponse.json({ error: 'missing jobId' }, { status: 400 });
  }

  try {
    const job = await requeueJob(jobId);
    if (!job) {
      return NextResponse.json({ error: 'job not found' }, { status: 404 });
    }

    const workerId = `admin-rerun-${process.pid}-${Date.now().toString(36)}`;
    after(async () => {
      try {
        const n = await runWorkerUntilIdle(workerId, {
          maxEmptyRounds: 3,
          idleMs: 2000,
          deadlineMs: 280_000,
        });
        console.info('[v2-admin rerun] drain done', jobId, `processed=${n}`);
      } catch (err) {
        console.error(
          '[v2-admin rerun]',
          jobId,
          err instanceof Error ? err.message : err,
        );
      }
    });

    return NextResponse.json({
      ok: true,
      job: {
        id: job.id,
        kind: job.kind,
        status: job.status,
        page_index: job.page_index,
        version: job.version,
        day: job.day,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
