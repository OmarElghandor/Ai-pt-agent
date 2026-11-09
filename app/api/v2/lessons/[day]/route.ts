import { NextResponse } from 'next/server';
import { requireV2User } from '@/lib/v2/auth/session';
import {
  getLatestLessonPack,
  getPublishedLesson,
} from '@/lib/v2/content/getPublishedLesson';
import { resolvePackForms } from '@/lib/v2/content/resolvePack';
import { mongoConfigured } from '@/lib/mongo';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ day: string }> },
) {
  const __auth = await requireV2User();
  if (__auth.error) return __auth.error;

  const { day: dayRaw } = await ctx.params;
  const day = Number(dayRaw);
  if (!Number.isInteger(day) || day < 1) {
    return NextResponse.json({ error: 'invalid day' }, { status: 400 });
  }

  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }

  // Prefer published; fall back to latest draft (same as day map / content pages).
  const lesson =
    (await getPublishedLesson(day)) ?? (await getLatestLessonPack(day));
  if (!lesson) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  return NextResponse.json({
    day: lesson.day,
    target_lang: lesson.target_lang,
    version: lesson.version,
    status: lesson.status,
    lesson: resolvePackForms(lesson.pack),
  });
}
