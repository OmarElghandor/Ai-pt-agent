import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { mongoConfigured } from '@/lib/mongo';
import { jobView, mongoJobStore } from '@/lib/v2/library/jobs';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ jobId: string }> },
) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const { jobId } = await ctx.params;
  const job = await mongoJobStore().get(jobId);
  if (!job) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ job: jobView(job) });
}
