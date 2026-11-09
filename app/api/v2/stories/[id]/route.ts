import { NextResponse } from 'next/server';
import { getStoryById } from '@/lib/v2/generation/lesson/storySave';
import { requireV2User } from '@/lib/v2/auth/session';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const __auth = await requireV2User();
  if (__auth.error) return __auth.error;

  const { id } = await ctx.params;
  const versionParam = new URL(_req.url).searchParams.get('version');
  const version = versionParam ? Number(versionParam) : undefined;
  const story = await getStoryById(
    decodeURIComponent(id),
    Number.isFinite(version) ? version : undefined,
  );
  if (!story) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ story });
}
