import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { getCurrentV2User } from '@/lib/v2/auth/session';
import { mongoConfigured } from '@/lib/mongo';
import { libraryErrorResponse } from '@/lib/v2/library/routeErrors';
import {
  acceptMeasuredLevel,
  approveReview,
  getReviewView,
  handEditLine,
} from '@/lib/v2/library/review';

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
    const view = await getReviewView(slug);
    if (!view) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(view);
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
    const body = (await req.json()) as {
      action: 'approve' | 'accept_level' | 'edit_line';
      line_index?: number;
      tl?: string;
      tl_f?: string;
      ar?: string;
      speaker?: string;
    };
    const user = await getCurrentV2User();
    const by = user?.email ?? undefined;
    if (body.action === 'approve') {
      await approveReview(slug, { by });
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'accept_level') {
      const measured = await acceptMeasuredLevel(slug, { by });
      return NextResponse.json({ ok: true, measured });
    }
    if (body.action === 'edit_line') {
      if (typeof body.line_index !== 'number') {
        return NextResponse.json({ error: 'line_index required' }, { status: 400 });
      }
      const result = await handEditLine(
        slug,
        body.line_index,
        {
          tl: body.tl,
          tl_f: body.tl_f,
          ar: body.ar,
          speaker: body.speaker,
        },
        { by },
      );
      return NextResponse.json({ ok: true, ...result });
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) {
    return libraryErrorResponse(e);
  }
}
