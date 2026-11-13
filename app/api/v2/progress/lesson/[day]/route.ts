import { NextResponse } from 'next/server';
import { requireV2User } from '@/lib/v2/auth/session';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2LessonProgressModel } from '@/lib/v2/mongo/models';
import { resumeHref } from '@/lib/v2/progress/lessonOpen';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ day: string }> },
) {
  const auth = await requireV2User();
  if (auth.error) return auth.error;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'mongo_unavailable' }, { status: 503 });
  }
  await connectMongo();

  const { day: raw } = await ctx.params;
  const day = Number(raw);
  if (!Number.isInteger(day) || day < 1) {
    return NextResponse.json({ error: 'invalid_day' }, { status: 400 });
  }

  const doc = await V2LessonProgressModel()
    .findOne({
      user_id: auth.user.id,
      target_lang: 'pt-PT',
      day,
    })
    .lean();

  if (!doc) {
    return NextResponse.json({
      day,
      status: day === 1 ? 'available' : 'locked',
      resume: null,
      resume_href: null,
      steps: [],
    });
  }

  const resume = doc.resume
    ? {
        step_id: doc.resume.step_id,
        page_index: doc.resume.page_index ?? undefined,
        item_index: doc.resume.item_index ?? undefined,
      }
    : null;

  return NextResponse.json({
    day: doc.day,
    status: doc.status,
    opens_on: doc.opens_on ?? null,
    resume,
    resume_href: resumeHref(
      doc.day,
      resume,
      doc.status as 'locked' | 'scheduled' | 'available' | 'in_progress' | 'completed',
    ),
    steps: doc.steps ?? [],
    day_questions: doc.day_questions,
    practice: doc.practice,
  });
}
