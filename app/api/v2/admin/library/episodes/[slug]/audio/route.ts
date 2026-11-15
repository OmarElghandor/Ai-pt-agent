import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { mongoConfigured } from '@/lib/mongo';
import { jobView } from '@/lib/v2/library/jobs';
import { libraryErrorResponse } from '@/lib/v2/library/routeErrors';
import {
  getAudioEstimate,
  runAudioBuild,
  startAudioBuild,
} from '@/lib/v2/library/audio';
import {
  createElevenLabsClient,
  stubElevenLabsClient,
} from '@/lib/v2/library/elevenlabs';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  try {
    const { slug } = await ctx.params;
    const estimate = await getAudioEstimate(slug);
    return NextResponse.json(estimate);
  } catch (e) {
    return libraryErrorResponse(e);
  }
}

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
    const body = (await req.json().catch(() => ({}))) as {
      line_index?: number;
    };
    const started = await startAudioBuild(slug, {
      line_index: body.line_index,
    });
    if (!started.ok) {
      return NextResponse.json(
        {
          error: 'فيه شغل شغال على الصوت دلوقتي',
          code: 'conflict',
          job: jobView(started.job),
        },
        { status: 409 },
      );
    }
    const client = process.env.ELEVENLABS_API_KEY
      ? createElevenLabsClient()
      : stubElevenLabsClient();
    void runAudioBuild(started.job.id, slug, {
      client,
      onlyLine: body.line_index ?? null,
    }).catch((err) => console.error('[library_audio]', slug, err));
    return NextResponse.json({ ok: true, job: jobView(started.job) });
  } catch (e) {
    return libraryErrorResponse(e);
  }
}
