import { NextResponse } from 'next/server';
import { getPublishedLesson } from '@/lib/v2/content/getPublishedLesson';
import { resolvePackForms } from '@/lib/v2/content/resolvePack';
import { mongoConfigured } from '@/lib/mongo';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ day: string }> },
) {
  const { day: dayRaw } = await ctx.params;
  const day = Number(dayRaw);
  if (!Number.isInteger(day) || day < 1) {
    return NextResponse.json({ error: 'invalid day' }, { status: 400 });
  }

  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }

  const published = await getPublishedLesson(day);
  if (!published) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  return NextResponse.json({
    day: published.day,
    target_lang: published.target_lang,
    version: published.version,
    status: published.status,
    lesson: resolvePackForms(published.pack),
  });
}
