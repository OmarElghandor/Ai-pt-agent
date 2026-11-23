/**
 * Persist / resume v2_review_sessions (16 §7 / §8).
 */

import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  V2AnswersModel,
  V2CoveragePlanModel,
  V2LessonProgressModel,
  V2PracticeQuestionsModel,
  V2ReviewSessionModel,
} from '@/lib/v2/mongo/models';
import { localDateString } from '@/lib/v2/progress/localDate';
import {
  PHASE1_STORY_DAYS,
  buildCoveragePlan,
  buildPracticeWindow,
  buildReviewSession,
  normalizeUserPractice,
  passedPairsFromAnswerLog,
  resolveStepSeconds,
  splitDailyBudget,
  type BankItem,
  type CoverageItemKind,
  type CoveragePlan,
} from '@/lib/v2/practice';
import { loadPublishedFlashcardsThrough } from '@/lib/v2/decks';
import { getPublishedLesson } from '@/lib/v2/content/getPublishedLesson';
import { PRACTICE_QUESTION_BUILDER_VERSION } from '@/lib/v2/review/questions';

export const REVIEW_BUILDER_VERSION = '1';

export type TodayReviewSession = {
  local_date: string;
  window: Array<{ day: number; position: 1 | 2 | 3 }>;
  budget_minutes: number;
  has_lesson_today: boolean;
  steps: unknown[];
  rounds_total: number;
  rounds_done: number;
  status: 'open' | 'done';
  resume: { round: number; step: number };
  empty?: boolean;
  builder_version?: string;
};

function mapExisting(doc: {
  local_date?: string | null;
  window?: unknown;
  budget_minutes?: number | null;
  has_lesson_today?: boolean | null;
  steps?: unknown[] | null;
  rounds_total?: number | null;
  rounds_done?: number | null;
  status?: string | null;
  resume?: { round?: number | null; step?: number | null } | null;
  builder_version?: string | null;
}): TodayReviewSession {
  return {
    local_date: String(doc.local_date),
    window:
      (doc.window as Array<{ day: number; position: 1 | 2 | 3 }>) ?? [],
    budget_minutes: Number(doc.budget_minutes ?? 14),
    has_lesson_today: Boolean(doc.has_lesson_today),
    steps: doc.steps ?? [],
    rounds_total: Number(doc.rounds_total ?? 1),
    rounds_done: Number(doc.rounds_done ?? 0),
    status: doc.status === 'done' ? 'done' : 'open',
    resume: {
      round: Number(doc.resume?.round ?? Math.max(1, Number(doc.rounds_done ?? 0) + 1)),
      step: Number(doc.resume?.step ?? 0),
    },
    builder_version: doc.builder_version ?? REVIEW_BUILDER_VERSION,
  };
}

/** Peek without building — for the tab dot (16 §8.1). */
export async function peekTodayReview(opts: {
  user_id: string;
  currentDay: number;
  timeZone?: string;
  now?: Date;
}): Promise<{
  empty: boolean;
  status: 'none' | 'open' | 'done';
  local_date: string;
}> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const now = opts.now ?? new Date();
  const tz = opts.timeZone ?? 'UTC';
  const local_date = localDateString(now, tz);

  if (opts.currentDay <= 1) {
    return { empty: true, status: 'none', local_date };
  }

  const existing = await V2ReviewSessionModel()
    .findOne({ user_id: opts.user_id, local_date })
    .select('status')
    .lean();
  if (existing) {
    return {
      empty: false,
      status: existing.status === 'done' ? 'done' : 'open',
      local_date,
    };
  }

  const completedDocs = await V2LessonProgressModel()
    .find({
      user_id: opts.user_id,
      status: 'completed',
      day: { $lt: opts.currentDay },
    })
    .select('day')
    .lean();
  const window = buildPracticeWindow({
    currentDay: opts.currentDay,
    completedDays: completedDocs.map((d) => Number(d.day)),
    storyDays: PHASE1_STORY_DAYS,
  });
  if (window.length === 0) {
    return { empty: true, status: 'none', local_date };
  }
  // Session not built yet, but window is non-empty → pending review
  return { empty: false, status: 'open', local_date };
}

export async function getOrCreateTodayReview(opts: {
  user_id: string;
  currentDay: number;
  timeZone?: string;
  now?: Date;
}): Promise<TodayReviewSession> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const now = opts.now ?? new Date();
  const tz = opts.timeZone ?? 'UTC';
  const local_date = localDateString(now, tz);

  const existing = await V2ReviewSessionModel()
    .findOne({ user_id: opts.user_id, local_date })
    .lean();
  if (existing) {
    return mapExisting(existing);
  }

  const completedDocs = await V2LessonProgressModel()
    .find({
      user_id: opts.user_id,
      status: 'completed',
      day: { $lt: opts.currentDay },
    })
    .select('day')
    .lean();
  const completedDays = completedDocs.map((d) => Number(d.day));
  const window = buildPracticeWindow({
    currentDay: opts.currentDay,
    completedDays,
    storyDays: PHASE1_STORY_DAYS,
  });

  // Day 1 / empty window — nothing saved (16 §8.2)
  if (window.length === 0) {
    return {
      local_date,
      window: [],
      budget_minutes: 0,
      has_lesson_today: true,
      steps: [],
      rounds_total: 0,
      rounds_done: 0,
      status: 'open',
      resume: { round: 1, step: 0 },
      empty: true,
    };
  }

  const currentProgress = await V2LessonProgressModel()
    .findOne({ user_id: opts.user_id, day: opts.currentDay })
    .select('status')
    .lean();
  const hasLessonToday =
    currentProgress?.status !== 'completed' &&
    currentProgress?.status !== 'scheduled';

  let dailyMinutes = 30;
  try {
    const mongoose = await import('mongoose');
    const db = mongoose.default.connection.db;
    if (db) {
      const userDoc = await db.collection('v2_users').findOne({
        $or: [{ id: opts.user_id }],
      });
      dailyMinutes = normalizeUserPractice(
        (userDoc as { practice?: unknown } | null)?.practice,
      ).daily_minutes;
    }
  } catch {
    // default
  }

  const split = splitDailyBudget({
    daily_minutes: dailyMinutes,
    has_lesson_today: Boolean(hasLessonToday),
  });

  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const recentAnswers = await V2AnswersModel()
    .find({
      user_id: opts.user_id,
      createdAt: { $gte: threeDaysAgo },
    })
    .select('question_id first_try verdict lesson_day source skill tests')
    .lean()
    .catch(() => []);

  const recentQuestionIds = new Set(
    recentAnswers.map((a) => String(a.question_id)).filter(Boolean),
  );

  const flaggedDocs = await V2PracticeQuestionsModel()
    .find({ status: 'flagged' })
    .select('id')
    .lean()
    .catch(() => []);
  const flaggedQuestionIds = new Set(
    flaggedDocs.map((d) => String(d.id)).filter(Boolean),
  );

  // Time-estimate feed from v2_user_level (16 §9.3) — best-effort.
  let timeOverrides: { user?: Record<string, number> } | null = null;
  try {
    const { V2UserLevelModel } = await import('@/lib/v2/mongo/models');
    const levelDoc = await V2UserLevelModel()
      .findOne({ user_id: opts.user_id })
      .select('time_by_type')
      .lean();
    if (levelDoc?.time_by_type && typeof levelDoc.time_by_type === 'object') {
      timeOverrides = {
        user: levelDoc.time_by_type as Record<string, number>,
      };
    }
  } catch {
    // level view optional at build time
  }

  const plans: CoveragePlan[] = [];
  const itemsByDay = new Map<number, BankItem[]>();
  const craftedByDay = new Map<
    number,
    import('./stepBuilders').CraftedQuestion[]
  >();
  const taughtItems: BankItem[] = [];

  for (const w of window) {
    let planDoc = await V2CoveragePlanModel()
      .findOne({ user_id: opts.user_id, lesson_day: w.day })
      .lean();
    const published = await getPublishedLesson(w.day);
    const bankItems: BankItem[] = (published?.pack.items ?? []).map((it) => {
      const image = (it as { image?: { url?: string } }).image;
      return {
        id: it.id,
        type: it.type,
        tl: 'tl' in it ? String((it as { tl?: string }).tl ?? '') : '',
        ar: 'ar' in it ? String((it as { ar?: string }).ar ?? '') : '',
        day: w.day,
        has_card: Boolean((it as { has_card?: boolean }).has_card),
        image_url: image?.url ?? null,
      };
    });
    itemsByDay.set(w.day, bankItems);
    taughtItems.push(...bankItems);

    const questions = (published?.pack.questions ?? []) as Array<{
      id: string;
      type: string;
      tests: string[];
      use?: 'lesson' | 'practice' | 'both';
    }>;
    craftedByDay.set(w.day, questions);

    if (!planDoc) {
      const lessonAnswers = recentAnswers.filter(
        (a) =>
          Number(a.lesson_day) === w.day &&
          a.first_try === true &&
          a.verdict === 'correct',
      );
      const passedInLesson = passedPairsFromAnswerLog(
        lessonAnswers.map((a) => ({
          first_try: Boolean(a.first_try),
          verdict: String(a.verdict),
          lesson_day: a.lesson_day ?? undefined,
          source: (a as { source?: string }).source,
          skill: a.skill ?? undefined,
          tests: (a as { tests?: { item_ids?: string[]; pattern_ids?: string[] } })
            .tests,
        })),
        w.day,
      );
      const coverageItems = bankItems.map((i) => ({
        id: i.id,
        kind: (i.type === 'pattern'
          ? 'pattern'
          : i.type === 'phrase'
            ? 'phrase'
            : i.type === 'form'
              ? 'verb'
              : 'word') as CoverageItemKind,
      }));
      const plan = buildCoveragePlan({
        user_id: opts.user_id,
        lesson_day: w.day,
        items: coverageItems,
        passedInLesson,
      });
      await V2CoveragePlanModel().create(plan);
      plans.push(plan);
    } else {
      plans.push({
        user_id: opts.user_id,
        lesson_day: w.day,
        pairs: (planDoc.pairs ?? []).map((p) => ({
          item_id: p.item_id,
          skill: p.skill as CoveragePlan['pairs'][0]['skill'],
          form: p.form ?? undefined,
          status: p.status as CoveragePlan['pairs'][0]['status'],
          answer_id: (p as { answer_id?: string }).answer_id,
        })),
      });
    }
  }

  const { byId } = await loadPublishedFlashcardsThrough(opts.currentDay);
  for (const it of byId.values()) {
    if (!taughtItems.some((t) => t.id === it.id)) {
      taughtItems.push({
        id: it.id,
        type: it.type,
        tl: 'tl' in it ? String((it as { tl?: string }).tl ?? '') : '',
        ar: 'ar' in it ? String((it as { ar?: string }).ar ?? '') : '',
        day: 1,
        has_card: true,
      });
    }
  }

  const olderPatterns = taughtItems.filter(
    (i) => i.type === 'pattern' && !window.some((w) => w.day === i.day),
  );

  const built = buildReviewSession({
    window,
    budgetMinutes: split.review_minutes,
    plans,
    itemsByDay,
    craftedByDay,
    taughtItems,
    currentDay: opts.currentDay,
    olderPatterns,
    recentQuestionIds,
    flaggedQuestionIds,
  });

  const doc = {
    user_id: opts.user_id,
    local_date,
    window,
    budget_minutes: split.review_minutes,
    has_lesson_today: Boolean(hasLessonToday),
    builder_version: REVIEW_BUILDER_VERSION,
    steps: built.steps.map((s) => ({
      kind: s.kind,
      lesson_day: s.lesson_day,
      pairs: s.pairs,
      slot_reason: s.slot_reason,
      estimated_seconds: timeOverrides
        ? resolveStepSeconds(s.type, timeOverrides)
        : s.estimated_seconds,
      round: s.round,
      question_id: s.question_id ?? (s.payload.question_id as string | undefined),
      question_version: PRACTICE_QUESTION_BUILDER_VERSION,
      question: { ...s.payload }, // frozen copy
      answer_id: null,
      result: null,
    })),
    rounds_total: built.rounds_total,
    rounds_done: 0,
    resume: { round: 1, step: 0 },
    status: 'open' as const,
    built_at: now,
  };

  try {
    await V2ReviewSessionModel().create(doc);
  } catch (err) {
    // Concurrent taps: unique user×date — return the winner
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: number }).code === 11000
    ) {
      const again = await V2ReviewSessionModel()
        .findOne({ user_id: opts.user_id, local_date })
        .lean();
      if (again) return mapExisting(again);
    }
    throw err;
  }

  return {
    local_date,
    window,
    budget_minutes: split.review_minutes,
    has_lesson_today: Boolean(hasLessonToday),
    steps: doc.steps,
    rounds_total: doc.rounds_total,
    rounds_done: 0,
    status: 'open',
    resume: { round: 1, step: 0 },
    builder_version: REVIEW_BUILDER_VERSION,
  };
}
