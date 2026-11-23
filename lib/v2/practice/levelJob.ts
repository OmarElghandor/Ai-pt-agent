/**
 * Debounced + nightly rebuild of v2_user_level and question stats (16 §9.3).
 * Never blocks the answers HTTP path.
 */

import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  V2AnswersModel,
  V2CoveragePlanModel,
  V2ItemStateModel,
  V2PracticeQuestionsModel,
  V2PracticeQuestionStatsModel,
  V2UserLevelModel,
  V2WeakSpotModel,
} from '@/lib/v2/mongo/models';
import { userLocalDate } from '@/lib/v2/progress/userLocalDate';
import {
  answerKeyFromPayload,
  computeQuestionStats,
} from './questionStats';
import { computeUserLevel } from './userLevel';

const DEBOUNCE_MS = 3 * 60_000;
const pendingUsers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingQuestions = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleUserLevelRebuild(userId: string): void {
  if (!userId || !mongoConfigured()) return;
  const prev = pendingUsers.get(userId);
  if (prev) clearTimeout(prev);
  const t = setTimeout(() => {
    pendingUsers.delete(userId);
    void rebuildUserLevel(userId).catch(() => {});
  }, DEBOUNCE_MS);
  pendingUsers.set(userId, t);
}

export function scheduleQuestionStatsRebuild(questionId: string): void {
  if (!questionId || !mongoConfigured()) return;
  const prev = pendingQuestions.get(questionId);
  if (prev) clearTimeout(prev);
  const t = setTimeout(() => {
    pendingQuestions.delete(questionId);
    void rebuildQuestionStats(questionId).catch(() => {});
  }, DEBOUNCE_MS);
  pendingQuestions.set(questionId, t);
}

/** Call after an answer is logged (fire-and-forget). */
export function scheduleLevelJobsAfterAnswer(opts: {
  userId: string;
  questionId?: string | null;
}): void {
  scheduleUserLevelRebuild(opts.userId);
  if (opts.questionId) scheduleQuestionStatsRebuild(opts.questionId);
}

export async function rebuildUserLevel(
  userId: string,
  opts?: { timezone?: string; today?: string },
): Promise<ReturnType<typeof computeUserLevel> | null> {
  if (!mongoConfigured()) return null;
  await connectMongo();

  const today = opts?.today ?? userLocalDate(opts?.timezone ?? 'Africa/Cairo');

  const [answers, items, coverage, weak] = await Promise.all([
    V2AnswersModel()
      .find({ user_id: userId })
      .select(
        'local_date createdAt skill source first_try verdict time_ms tests lesson_day question_id',
      )
      .lean(),
    V2ItemStateModel()
      .find({ user_id: userId })
      .select('item_id stage')
      .lean(),
    V2CoveragePlanModel()
      .find({ user_id: userId })
      .select('lesson_day pairs')
      .lean(),
    V2WeakSpotModel()
      .find({ user_id: userId, status: { $in: ['open', 'improving'] } })
      .select('problem')
      .lean(),
  ]);

  const qids = [
    ...new Set(
      answers.map((a) => String(a.question_id)).filter((id) => id && id !== 'undefined'),
    ),
  ];
  const qDocs =
    qids.length > 0
      ? await V2PracticeQuestionsModel()
          .find({ id: { $in: qids } })
          .select('id type')
          .lean()
      : [];
  const typeByQ = new Map(qDocs.map((q) => [String(q.id), String(q.type)]));

  const level = computeUserLevel({
    today,
    answers: answers.map((a) => ({
      local_date: String(a.local_date),
      created_at: a.createdAt as Date | undefined,
      skill: a.skill ? String(a.skill) : null,
      type: typeByQ.get(String(a.question_id)) ?? null,
      first_try: Boolean(a.first_try),
      verdict: String(a.verdict),
      time_ms: typeof a.time_ms === 'number' ? a.time_ms : 0,
      tests: a.tests as { item_ids?: string[]; pattern_ids?: string[] },
      lesson_day: typeof a.lesson_day === 'number' ? a.lesson_day : null,
    })),
    items: items.map((i) => ({
      item_id: String(i.item_id),
      stage: (i as { stage?: number }).stage ?? 1,
    })),
    coverage: coverage.map((c) => ({
      lesson_day: Number(c.lesson_day),
      pairs: (c.pairs ?? []).map((p) => ({ status: String(p.status) })),
    })),
    weak: weak.map((w) => ({ problem: String(w.problem) })),
  });

  const now = new Date();
  await V2UserLevelModel().updateOne(
    { user_id: userId },
    {
      $set: {
        user_id: userId,
        rebuilt_at: now,
        skills: level.skills,
        patterns: level.patterns,
        lessons: level.lessons,
        problem_ids: level.problem_ids,
        time_by_type: level.time_by_type,
        answer_count: level.answer_count,
      },
    },
    { upsert: true },
  );

  return level;
}

export async function rebuildQuestionStats(questionId: string): Promise<{
  flagged: boolean;
} | null> {
  if (!mongoConfigured()) return null;
  await connectMongo();

  const answers = await V2AnswersModel()
    .find({ question_id: questionId })
    .select('question_id first_try verdict time_ms answer')
    .lean();

  const stats = computeQuestionStats(
    questionId,
    answers.map((a) => ({
      question_id: String(a.question_id),
      first_try: Boolean(a.first_try),
      verdict: String(a.verdict),
      time_ms: typeof a.time_ms === 'number' ? a.time_ms : 0,
      answer_key: answerKeyFromPayload(a.answer),
    })),
  );

  const now = new Date();
  await V2PracticeQuestionStatsModel().updateOne(
    { question_id: questionId },
    {
      $set: {
        question_id: questionId,
        attempts: stats.attempts,
        first_try_total: stats.first_try_total,
        first_try_correct: stats.first_try_correct,
        avg_time_ms: stats.avg_time_ms,
        wrong_answers: stats.wrong_answers,
        rebuilt_at: now,
        ...(stats.should_auto_flag ? { auto_flagged_at: now } : {}),
      },
    },
    { upsert: true },
  );

  let flagged = false;
  if (stats.should_auto_flag) {
    const res = await V2PracticeQuestionsModel().updateOne(
      { id: questionId, status: 'active' },
      { $set: { status: 'flagged' } },
    );
    flagged = (res.modifiedCount ?? 0) > 0 || (res.matchedCount ?? 0) > 0;
    // Also flag crafted ids that live only as answer question_ids:
    // status change only applies when a shared store doc exists.
  }

  return { flagged: flagged || stats.should_auto_flag };
}

/** Nightly: rebuild every user with answers + refresh auto-flag candidates. */
export async function rebuildAllUserLevels(opts?: {
  limit?: number;
}): Promise<{ users: number; questions: number }> {
  if (!mongoConfigured()) return { users: 0, questions: 0 };
  await connectMongo();

  const userIds = await V2AnswersModel().distinct('user_id');
  const limit = opts?.limit ?? userIds.length;
  let users = 0;
  for (const id of userIds.slice(0, limit)) {
    await rebuildUserLevel(String(id));
    users += 1;
  }

  const qids = await V2AnswersModel().distinct('question_id');
  let questions = 0;
  for (const qid of qids.slice(0, opts?.limit ?? qids.length)) {
    await rebuildQuestionStats(String(qid));
    questions += 1;
  }

  return { users, questions };
}

/** Test helper — run pending timers immediately. */
export function flushLevelJobTimersForTests(): void {
  for (const [id, t] of pendingUsers) {
    clearTimeout(t);
    pendingUsers.delete(id);
  }
  for (const [id, t] of pendingQuestions) {
    clearTimeout(t);
    pendingQuestions.delete(id);
  }
}
