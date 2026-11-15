import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { getCurrentV2User } from '@/lib/v2/auth/session';
import { mongoConfigured } from '@/lib/mongo';
import { approveBrief } from '@/lib/v2/library/brief';
import { libraryErrorResponse } from '@/lib/v2/library/routeErrors';

export const runtime = 'nodejs';

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const { slug } = await ctx.params;
  const user = await getCurrentV2User();
  try {
    const approved = await approveBrief(slug, { by: user?.email || undefined });
    return NextResponse.json(approved);
  } catch (e) {
    return libraryErrorResponse(e);
  }
}
