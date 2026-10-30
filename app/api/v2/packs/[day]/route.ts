import { NextResponse } from 'next/server';
import { isV2Enabled } from '@/lib/v2/flags';
import { getPublishedPack } from '@/lib/v2/generation/pack/save';
import { getPublishedLesson } from '@/lib/v2/content/getPublishedLesson';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ day: string }> },
) {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  const { day: dayStr } = await ctx.params;
  const day = Number(dayStr);
  if (!Number.isInteger(day) || day < 1) {
    return NextResponse.json({ error: 'invalid day' }, { status: 400 });
  }
  const pack = await getPublishedPack(day);
  if (!pack) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const lesson = await getPublishedLesson(day);
  const stale =
    Boolean(pack.meta?.stale) ||
    (lesson != null &&
      pack.meta?.lesson_version != null &&
      pack.meta.lesson_version !== lesson.version);

  return NextResponse.json({
    day: pack.day,
    version: pack.version,
    target_lang: pack.target_lang,
    status: pack.status,
    stale,
    lesson_version: pack.meta?.lesson_version ?? null,
    data: pack.data,
  });
}
