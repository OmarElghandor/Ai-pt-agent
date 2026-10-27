import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { getJobDetail, listJobsForVersion } from '@/lib/v2/generation/jobs';
import { BUDGETS, getBudget } from '@/lib/v2/generation/lesson/budgets';
import { mongoConfigured } from '@/lib/mongo';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ jobId: string }> },
) {
  const denied = denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }

  const { jobId } = await ctx.params;
  const job = await getJobDetail(jobId);
  if (!job) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const siblings = await listJobsForVersion(
    job.day,
    job.version,
    job.target_lang,
  );
  const consumers = siblings
    .filter((j) => j.depends_on.includes(job.id))
    .map((j) => ({
      id: j.id,
      kind: j.kind,
      page_index: j.page_index,
      status: j.status,
    }));

  const budget = getBudget(job.kind);

  return NextResponse.json({
    job,
    consumers,
    budget,
    budgets: BUDGETS,
  });
}
