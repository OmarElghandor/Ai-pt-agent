import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { getCurrentV2User } from '@/lib/v2/auth/session';
import { mongoConfigured } from '@/lib/mongo';
import { jobView } from '@/lib/v2/library/jobs';
import { libraryErrorResponse } from '@/lib/v2/library/routeErrors';
import {
  runScriptJob,
  startScriptGenerate,
} from '@/lib/v2/library/scriptGenerate';

export const runtime = 'nodejs';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  try {
    const { slug } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { force?: boolean };
    const user = await getCurrentV2User();
    const started = await startScriptGenerate(slug, {
      force: !!body.force,
      by: user?.email ?? undefined,
    });
    if (!started.ok) {
      return NextResponse.json(
        {
          error: 'فيه شغل شغال على السكريبت دلوقتي',
          code: 'conflict',
          job: jobView(started.job),
        },
        { status: 409 },
      );
    }
    void runScriptJob(started.job.id, slug, {
      by: user?.email ?? undefined,
    }).catch((err) => {
      console.error('[library_script]', slug, err);
    });
    return NextResponse.json({
      ok: true,
      job: jobView(started.job),
      estimate: started.estimate,
    });
  } catch (e) {
    return libraryErrorResponse(e);
  }
}
