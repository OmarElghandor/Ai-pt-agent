import { after, NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import {
  enqueueAndStartGeneratePack,
  enqueueGeneratePack,
} from '@/lib/v2/generation/jobs';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ day: string }> },
) {
  const denied = denyUnlessV2Admin();
  if (denied) return denied;

  const { day: dayStr } = await ctx.params;
  const day = Number(dayStr);
  if (!Number.isInteger(day) || day < 1) {
    return NextResponse.json({ error: 'invalid day' }, { status: 400 });
  }

  const url = new URL(req.url);
  const inline = url.searchParams.get('inline') !== '0';

  try {
    const result = inline
      ? await enqueueAndStartGeneratePack({ day })
      : await enqueueGeneratePack({ day });

    if (!inline) {
      after(async () => {
        const { runWorkerUntilIdle } = await import('@/lib/v2/generation/jobs');
        await runWorkerUntilIdle(`admin-pack-${day}-${Date.now()}`, {
          maxEmptyRounds: 4,
          idleMs: 1500,
          deadlineMs: 120_000,
        });
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
