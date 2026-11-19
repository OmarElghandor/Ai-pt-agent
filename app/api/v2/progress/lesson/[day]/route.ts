import { NextResponse } from 'next/server';
import { requireV2User } from '@/lib/v2/auth/session';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2LessonProgressModel } from '@/lib/v2/mongo/models';
import { buildDaySteps } from '@/lib/v2/progress/daySteps';
import { buildStepView } from '@/lib/v2/progress/stepView';
import type { LessonProgressRecord } from '@/lib/v2/progress/events/store';

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

  const shared = await buildDaySteps({ day });
  const rawDayQuestions = doc?.day_questions as
    | LessonProgressRecord['day_questions']
    | null
    | undefined;
  const rawPractice = doc?.practice as
    | LessonProgressRecord['practice']
    | null
    | undefined;
  const progress = doc
    ? ({
        user_id: String(doc.user_id),
        target_lang: String(doc.target_lang),
        day: doc.day as number,
        status: doc.status as LessonProgressRecord['status'],
        opens_on: (doc.opens_on as string | null) ?? null,
        lesson_version: (doc.lesson_version as number | null) ?? null,
        steps: (doc.steps ?? []).map((s) => ({
          id: s.id,
          status: s.status as LessonProgressRecord['steps'][number]['status'],
          done_at: s.done_at ? new Date(s.done_at as Date) : null,
        })),
        resume: doc.resume
          ? {
              step_id: doc.resume.step_id,
              page_index: doc.resume.page_index ?? undefined,
              item_index: doc.resume.item_index ?? undefined,
            }
          : null,
        day_questions: {
          total: Number(rawDayQuestions?.total ?? 0),
          answered: Number(rawDayQuestions?.answered ?? 0),
          first_try_correct: Number(rawDayQuestions?.first_try_correct ?? 0),
          per_skill: { ...(rawDayQuestions?.per_skill ?? {}) },
        },
        practice: {
          times: Number(rawPractice?.times ?? 0),
          last_at: rawPractice?.last_at
            ? new Date(rawPractice.last_at as Date)
            : null,
          said: Number(rawPractice?.said ?? 0),
          understood: Number(rawPractice?.understood ?? 0),
          best_said: Number(rawPractice?.best_said ?? 0),
        },
        started_at: doc.started_at ? new Date(doc.started_at as Date) : null,
        completed_at: doc.completed_at
          ? new Date(doc.completed_at as Date)
          : null,
        last_opened_at: doc.last_opened_at
          ? new Date(doc.last_opened_at as Date)
          : null,
        times_completed: Number(doc.times_completed ?? 0),
        minutes: Number(doc.minutes ?? 0),
      } satisfies LessonProgressRecord)
    : null;

  const view = buildStepView(progress, shared?.steps ?? []);
  const resume = progress?.resume ?? null;

  if (!doc) {
    return NextResponse.json({
      day,
      status: day === 1 ? 'available' : 'locked',
      resume: null,
      resume_href: view.nextStep?.href ?? null,
      steps: [],
      step_view: {
        done: view.done,
        total: view.total,
        next_step: view.nextStep,
        started: view.started,
      },
    });
  }

  return NextResponse.json({
    day: doc.day,
    status: doc.status,
    opens_on: doc.opens_on ?? null,
    resume,
    resume_href: view.nextStep?.href ?? null,
    steps: doc.steps ?? [],
    day_questions: doc.day_questions,
    practice: doc.practice,
    step_view: {
      done: view.done,
      total: view.total,
      next_step: view.nextStep,
      last_done_step: view.lastDoneStep,
      started: view.started,
      last_step_done_at: view.lastStepDoneAt
        ? view.lastStepDoneAt.toISOString()
        : null,
    },
  });
}
