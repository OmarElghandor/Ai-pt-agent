import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { getLatestLesson } from '@/lib/v2/generation/lesson/save';
import { warmLessonPackAudio } from '@/lib/v2/generation/warmAudio';
import { mongoConfigured } from '@/lib/mongo';
import type { LessonPack } from '@/lib/v2/content/lesson';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ day: string }> },
) {
  const denied = denyUnlessV2Admin();
  if (denied) return denied;

  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }

  const { day: dayRaw } = await ctx.params;
  const day = Number(dayRaw);
  if (!Number.isInteger(day) || day < 1) {
    return NextResponse.json({ error: 'invalid day' }, { status: 400 });
  }

  const lesson = await getLatestLesson(day);
  if (!lesson) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  try {
    const result = await warmLessonPackAudio(lesson.data as LessonPack);
    return NextResponse.json({
      day: lesson.day,
      version: lesson.version,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
