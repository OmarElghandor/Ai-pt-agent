import { NextResponse } from 'next/server';
import { resolvePackForms } from '@/lib/v2/content/resolvePack';
import type { LessonPack } from '@/lib/v2/content/lesson';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2LessonModel } from '@/lib/v2/mongo/models';

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

  await connectMongo();
  const doc = await V2LessonModel()
    .findOne({ day, status: 'published' })
    .sort({ version: -1 })
    .lean();

  if (!doc) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const resolved = resolvePackForms(doc.data as LessonPack);
  return NextResponse.json({
    day: doc.day,
    target_lang: doc.target_lang,
    version: doc.version,
    status: doc.status,
    lesson: resolved,
  });
}
