import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { getCurrentV2User } from '@/lib/v2/auth/session';
import { mongoConfigured } from '@/lib/mongo';
import { jobView } from '@/lib/v2/library/jobs';
import { libraryErrorResponse } from '@/lib/v2/library/routeErrors';
import {
  runScriptRewriteJob,
  startScriptRewrite,
  type RewriteParams,
} from '@/lib/v2/library/scriptRewrite';

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
    const body = (await req.json()) as RewriteParams;
    if (body.mode !== 'line' && body.mode !== 'moment') {
      return NextResponse.json({ error: 'mode must be line or moment' }, { status: 400 });
    }
    const user = await getCurrentV2User();
    const params: RewriteParams = {
      mode: body.mode,
      line_index: body.line_index,
      moment_id: body.moment_id,
      instruction: body.instruction,
    };
    const started = await startScriptRewrite(slug, params, {
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
    void runScriptRewriteJob(started.job.id, slug, params, {
      by: user?.email ?? undefined,
    }).catch((err) => {
      console.error('[library_rewrite]', slug, err);
    });
    return NextResponse.json({
      ok: true,
      job: jobView(started.job),
      targets: started.targets,
    });
  } catch (e) {
    return libraryErrorResponse(e);
  }
}
