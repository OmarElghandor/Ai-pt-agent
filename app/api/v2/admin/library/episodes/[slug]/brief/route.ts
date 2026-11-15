import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { getCurrentV2User } from '@/lib/v2/auth/session';
import { mongoConfigured } from '@/lib/mongo';
import { getBrief, saveBrief } from '@/lib/v2/library/brief';
import { libraryErrorResponse } from '@/lib/v2/library/routeErrors';

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
  const found = await getBrief(slug);
  if (!found) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(found);
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
  let body: { brief?: unknown; confirm_edit_approved?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const { slug } = await ctx.params;
  const user = await getCurrentV2User();
  try {
    const saved = await saveBrief(slug, body.brief, {
      confirmEditApproved: body.confirm_edit_approved === true,
      by: user?.email || undefined,
    });
    return NextResponse.json(saved);
  } catch (e) {
    return libraryErrorResponse(e);
  }
}
