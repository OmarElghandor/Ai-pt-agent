import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { getCurrentV2User } from '@/lib/v2/auth/session';
import { mongoConfigured, connectMongo } from '@/lib/mongo';
import { V2LibraryEpisodeModel } from '@/lib/v2/mongo/libraryModels';
import { jobView } from '@/lib/v2/library/jobs';
import { libraryErrorResponse } from '@/lib/v2/library/routeErrors';
import {
  patchLineTokens,
  runTokensJob,
  startTokensJob,
} from '@/lib/v2/library/tokensGenerate';
import { LIBRARY_LANG } from '@/lib/v2/library/types';
import { mongoJobStore } from '@/lib/v2/library/jobs';

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
  const { slug } = await ctx.params;
  await connectMongo();
  const episode = await V2LibraryEpisodeModel()
    .findOne({ target_lang: LIBRARY_LANG, slug })
    .sort({ version: -1 })
    .lean();
  if (!episode) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const job = await mongoJobStore().latest(LIBRARY_LANG, slug, 'tokens');
  return NextResponse.json({
    stages: episode.stages,
    lines: (episode.lines as { tl: string; tokens?: unknown[] }[]).map((l, i) => ({
      line_index: i,
      tl: l.tl,
      tokens: l.tokens ?? [],
    })),
    job: job ? jobView(job) : null,
  });
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
      line_indexes?: number[];
    };
    const user = await getCurrentV2User();
    const started = await startTokensJob(slug, {
      line_indexes: body.line_indexes,
      by: user?.email ?? undefined,
    });
    if (!started.ok) {
      return NextResponse.json(
        { error: 'فيه شغل شغال على الكلمات دلوقتي', code: 'conflict', job: jobView(started.job) },
        { status: 409 },
      );
    }
    void runTokensJob(started.job.id, slug, {
      line_indexes: body.line_indexes ?? null,
      by: user?.email ?? undefined,
    }).catch((err) => console.error('[library_tokens]', slug, err));
    return NextResponse.json({ ok: true, job: jobView(started.job) });
  } catch (e) {
    return libraryErrorResponse(e);
  }
}

export async function PATCH(
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
    const body = (await req.json()) as {
      line_index: number;
      action:
        | { type: 'edit'; token_index: number; lemma?: string; meaning_ar?: string }
        | { type: 'merge'; from: number; to: number }
        | { type: 'split'; chunk_id: string };
    };
    const user = await getCurrentV2User();
    const tokens = await patchLineTokens(slug, body.line_index, body.action, {
      by: user?.email ?? undefined,
    });
    return NextResponse.json({ ok: true, tokens });
  } catch (e) {
    return libraryErrorResponse(e);
  }
}
