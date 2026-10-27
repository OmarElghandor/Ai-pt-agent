import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { getLatestLesson } from '@/lib/v2/generation/lesson/save';
import { resolvePackForms } from '@/lib/v2/content/resolvePack';
import type { LessonPack } from '@/lib/v2/content/lesson';
import { mongoConfigured } from '@/lib/mongo';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ day: string }> },
) {
  const denied = denyUnlessV2Admin();
  if (denied) return denied;

  const { day: dayRaw } = await ctx.params;
  const day = Number(dayRaw);
  if (!Number.isInteger(day) || day < 1) {
    return NextResponse.json({ error: 'invalid day' }, { status: 400 });
  }

  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }

  const lesson = await getLatestLesson(day);
  if (!lesson) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // Mid-generation drafts may have null page slots — strip for preview.
  const raw = lesson.data as Partial<LessonPack> & { pages?: unknown[] };
  const pages = (
    Array.isArray(raw.pages)
      ? raw.pages.filter((p) => p != null && typeof p === 'object')
      : []
  ) as LessonPack['pages'];
  const pack: LessonPack = {
    lesson: raw.lesson ?? {
      id: `pt-PT.d${String(day).padStart(2, '0')}`,
      target_lang: 'pt-PT',
      day,
      kind: 'lesson',
      pages: pages.map((p) => p.id),
    },
    items: Array.isArray(raw.items) ? raw.items : [],
    pages,
    questions: Array.isArray(raw.questions) ? raw.questions : [],
    micro: raw.micro,
    speak_prompts: raw.speak_prompts,
  };

  let resolved: LessonPack = pack;
  try {
    if (pack.pages.length > 0) {
      resolved = resolvePackForms(pack) as LessonPack;
    }
  } catch {
    resolved = pack;
  }

  return NextResponse.json({
    day: lesson.day,
    target_lang: lesson.target_lang,
    version: lesson.version,
    status: lesson.status,
    meta: lesson.meta ?? null,
    lesson: resolved,
  });
}
