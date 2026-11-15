import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { getCurrentV2User } from '@/lib/v2/auth/session';
import { mongoConfigured } from '@/lib/mongo';
import { libraryErrorResponse } from '@/lib/v2/library/routeErrors';
import {
  hideEpisode,
  publishChecklist,
  publishEpisode,
} from '@/lib/v2/library/publish';

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
    return NextResponse.json(await publishChecklist(slug));
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
      action?: 'publish' | 'hide';
      new_version?: boolean;
    };
    const user = await getCurrentV2User();
    if (body.action === 'hide') {
      await hideEpisode(slug, { by: user?.email });
      return NextResponse.json({ ok: true });
    }
    const result = await publishEpisode(slug, {
      by: user?.email,
      new_version: !!body.new_version,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return libraryErrorResponse(e);
  }
}
