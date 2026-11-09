import { NextResponse } from 'next/server';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2ImageModel } from '@/lib/v2/mongo/models';
import { requireV2User } from '@/lib/v2/auth/session';

export const runtime = 'nodejs';

/**
 * Fallback lookup: 302 to ready url, else 404 (player keeps placeholder).
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ key: string }> },
) {
  const __auth = await requireV2User();
  if (__auth.error) return __auth.error;

  const { key: raw } = await ctx.params;
  const key = decodeURIComponent(raw);
  if (!key) {
    return NextResponse.json({ error: 'missing key' }, { status: 400 });
  }
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  await connectMongo();
  const doc = await V2ImageModel()
    .findOne({ key, status: 'ready', url: { $exists: true, $ne: '' } })
    .select({ url: 1 })
    .lean();
  if (!doc?.url) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.redirect(String(doc.url), 302);
}
