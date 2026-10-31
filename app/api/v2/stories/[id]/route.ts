import { NextResponse } from 'next/server';
import { getStoryById } from '@/lib/v2/generation/lesson/storySave';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
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
