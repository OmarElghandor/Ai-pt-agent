import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import {
  V2PracticeQuestionsModel,
  V2PracticeQuestionStatsModel,
} from '@/lib/v2/mongo/models';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { shouldAutoFlagQuestion } from '@/lib/v2/practice/questionStats';
import { rebuildQuestionStats } from '@/lib/v2/practice/levelJob';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  await connectMongo();

  const url = new URL(req.url);
  const status = url.searchParams.get('status'); // active | flagged | retired | all
  const flaggedOnly = url.searchParams.get('flagged') === '1';
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 80)));

  const filter: Record<string, unknown> = {};
  if (flaggedOnly || status === 'flagged') filter.status = 'flagged';
  else if (status && status !== 'all') filter.status = status;

  const questions = await V2PracticeQuestionsModel()
    .find(filter)
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select('id type skill status lesson_day builder_version')
    .lean();

  const ids = questions.map((q) => String(q.id));
  const statsDocs = await V2PracticeQuestionStatsModel()
    .find({ question_id: { $in: ids } })
    .lean();
  const statsById = new Map(statsDocs.map((s) => [String(s.question_id), s]));

  return NextResponse.json({
    questions: questions.map((q) => {
      const s = statsById.get(String(q.id));
      const first_try_total = s?.first_try_total ?? 0;
      const first_try_correct = s?.first_try_correct ?? 0;
      const percent =
        first_try_total > 0
          ? Math.round((100 * first_try_correct) / first_try_total)
          : null;
      return {
        id: String(q.id),
        type: q.type,
        skill: q.skill,
        status: q.status,
        lesson_day: q.lesson_day ?? null,
        builder_version: q.builder_version,
        attempts: s?.attempts ?? 0,
        first_try_total,
        first_try_correct,
        percent,
        avg_time_ms: s?.avg_time_ms ?? 0,
        most_common_wrong: mostCommon(
          (s?.wrong_answers ?? {}) as Record<string, number>,
        ),
        auto_flagged_at: s?.auto_flagged_at ?? null,
        would_auto_flag: shouldAutoFlagQuestion({
          first_try_total,
          first_try_correct,
        }),
      };
    }),
  });
}

export async function POST(req: Request) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  await connectMongo();
  const body = (await req.json().catch(() => ({}))) as {
    question_id?: string;
    action?: 'rebuild' | 'unflag' | 'retire';
  };
  if (!body.question_id) {
    return NextResponse.json({ error: 'question_id required' }, { status: 400 });
  }
  if (body.action === 'rebuild') {
    const result = await rebuildQuestionStats(body.question_id);
    return NextResponse.json({ ok: true, ...result });
  }
  if (body.action === 'unflag') {
    await V2PracticeQuestionsModel().updateOne(
      { id: body.question_id },
      { $set: { status: 'active' } },
    );
    return NextResponse.json({ ok: true });
  }
  if (body.action === 'retire') {
    await V2PracticeQuestionsModel().updateOne(
      { id: body.question_id },
      { $set: { status: 'retired' } },
    );
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}

function mostCommon(hist: Record<string, number>): string | null {
  let best: string | null = null;
  let n = 0;
  for (const [k, v] of Object.entries(hist)) {
    if (v > n) {
      n = v;
      best = k;
    }
  }
  return best;
}
