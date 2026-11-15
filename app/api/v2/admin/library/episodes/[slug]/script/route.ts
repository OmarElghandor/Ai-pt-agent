import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { mongoConfigured } from '@/lib/mongo';
import { libraryErrorResponse } from '@/lib/v2/library/routeErrors';
import { getScriptView } from '@/lib/v2/library/scriptGenerate';

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
    const view = await getScriptView(slug);
    if (!view) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(view);
  } catch (e) {
    return libraryErrorResponse(e);
  }
}
