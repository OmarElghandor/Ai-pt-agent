import { NextResponse } from 'next/server';
import { requireV2User } from '@/lib/v2/auth/session';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { buildProblemPracticeQuestions } from '@/lib/v2/progress/weak/practiceSession';
import { learnerCurrentDay } from '@/lib/v2/progress/learnerDay';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ problemId: string }> },
) {
  const auth = await requireV2User();
  if (auth.error) return auth.error;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'mongo_unavailable' }, { status: 503 });
  }
  await connectMongo();
  const { problemId } = await ctx.params;
  const day = await learnerCurrentDay(auth.user.id);
  const questions = await buildProblemPracticeQuestions({
    problemId: decodeURIComponent(problemId),
    currentDay: day,
  });
  return NextResponse.json({
    problem: decodeURIComponent(problemId),
    questions,
  });
}
