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
  classifyReviewEmpty,
  normalizeUserPractice,
  passedPairsFromAnswerLog,
  resolveStepSeconds,
  splitDailyBudget,
  type BankItem,
  type CoverageItemKind,
  type CoveragePlan,
  type ReviewEmptyReason,
} from '@/lib/v2/practice';
import { loadPublishedFlashcardsThrough } from '@/lib/v2/decks';
import { getLessonForPractice } from '@/lib/v2/content/getPublishedLesson';
import { PRACTICE_QUESTION_BUILDER_VERSION } from '@/lib/v2/review/questions';

/** Bump when step building changes; untouched sessions of an older version are rebuilt. */
export const REVIEW_BUILDER_VERSION = '2';

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
  empty_reason?: ReviewEmptyReason;
  completed_days?: number[];
  current_day?: number;
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

/**
 * Items that get their own coverage pairs. Derived pattern examples
 * (`pattern.x.ex.n`) are tested through their pattern, and items with no
 * Portuguese text can't be asked about.
 */
function coverageBankItems(items: BankItem[]): BankItem[] {
  return items.filter(
    (i) => !i.derived && (i.type === 'pattern' || Boolean(i.tl?.trim())),
  );
}

async function loadCompletedDays(
  userId: string,
  targetLang: string,
): Promise<number[]> {
  const docs = await V2LessonProgressModel()
    .find({
      user_id: userId,
      target_lang: targetLang,
      status: 'completed',
    })
    .select('day')
    .lean();
  return docs.map((d) => Number(d.day)).filter((d) => d >= 1);
}

function emptySessionPayload(opts: {
  local_date: string;
  currentDay: number;
  completedDaysAll: number[];
  windowLength?: number;
  stepsLength?: number;
  reason?: ReviewEmptyReason;
}): TodayReviewSession {
  const reason =
    opts.reason ??
    classifyReviewEmpty({
      currentDay: opts.currentDay,
      completedDaysAll: opts.completedDaysAll,
      windowLength: opts.windowLength ?? 0,
      stepsLength: opts.stepsLength,
    }) ??
    'current_day_is_1';
  return {
    local_date: opts.local_date,
    window: [],
    budget_minutes: 0,
    has_lesson_today: true,
    steps: [],
    rounds_total: 0,
    rounds_done: 0,
    status: 'open',
    resume: { round: 1, step: 0 },
    empty: true,
    empty_reason: reason,
    completed_days: opts.completedDaysAll,
    current_day: opts.currentDay,
  };
}

/** Peek without building — for the tab dot (16 §8.1). */
export async function peekTodayReview(opts: {
  user_id: string;
  currentDay: number;
  timeZone?: string;
  target_lang?: string;
  now?: Date;
}): Promise<{
  empty: boolean;
  status: 'none' | 'open' | 'done';
  local_date: string;
  empty_reason?: ReviewEmptyReason;
  completed_days?: number[];
  current_day?: number;
}> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const now = opts.now ?? new Date();
  const tz = opts.timeZone ?? 'UTC';
  const target_lang = opts.target_lang ?? 'pt-PT';
  const local_date = localDateString(now, tz);
  const completedDaysAll = await loadCompletedDays(opts.user_id, target_lang);

  if (opts.currentDay <= 1) {
    const reason =
      classifyReviewEmpty({
        currentDay: opts.currentDay,
        completedDaysAll,
        windowLength: 0,
      }) ?? 'current_day_is_1';
    return {
      empty: true,
      status: 'none',
      local_date,
      empty_reason: reason,
      completed_days: completedDaysAll,
      current_day: opts.currentDay,
    };
  }

  const existing = await V2ReviewSessionModel()
    .findOne({ user_id: opts.user_id, local_date })
    .select('status steps')
    .lean();
  if (existing) {
    const stepCount = Array.isArray(existing.steps) ? existing.steps.length : 0;
    if (stepCount === 0 && existing.status !== 'done') {
      return {
        empty: true,
        status: 'none',
        local_date,
        empty_reason: 'empty_steps',
        completed_days: completedDaysAll,
        current_day: opts.currentDay,
      };
    }
    return {
      empty: false,
      status: existing.status === 'done' ? 'done' : 'open',
      local_date,
      completed_days: completedDaysAll,
      current_day: opts.currentDay,
    };
  }

  const window = buildPracticeWindow({
    currentDay: opts.currentDay,
    completedDays: completedDaysAll,
    storyDays: PHASE1_STORY_DAYS,
  });
  if (window.length === 0) {
    const reason =
      classifyReviewEmpty({
        currentDay: opts.currentDay,
        completedDaysAll,
        windowLength: 0,
      }) ?? 'no_completed_before_current';
    return {
      empty: true,
      status: 'none',
      local_date,
      empty_reason: reason,
      completed_days: completedDaysAll,
      current_day: opts.currentDay,
    };
  }
  // Session not built yet, but window is non-empty → pending review
  return {
    empty: false,
    status: 'open',
    local_date,
    completed_days: completedDaysAll,
    current_day: opts.currentDay,
  };
}

export async function getOrCreateTodayReview(opts: {
  user_id: string;
  currentDay: number;
  timeZone?: string;
  target_lang?: string;
  now?: Date;
  /**
   * Testing: throw away today's session (even if answered) and the window's
   * coverage plans, ignore the 3-day no-repeat rule, and build a new mix.
   */
  regenerate?: boolean;
}): Promise<TodayReviewSession> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const now = opts.now ?? new Date();
  const tz = opts.timeZone ?? 'UTC';
  const target_lang = opts.target_lang ?? 'pt-PT';
  const local_date = localDateString(now, tz);

  const completedDaysAll = await loadCompletedDays(opts.user_id, target_lang);

  if (opts.regenerate) {
    await V2ReviewSessionModel().deleteOne({ user_id: opts.user_id, local_date });
  }

  const existing = await V2ReviewSessionModel()
    .findOne({ user_id: opts.user_id, local_date })
    .lean();
  if (existing) {
    const stepCount = Array.isArray(existing.steps) ? existing.steps.length : 0;
    // Rebuild when the session is empty, or was built by an older builder
    // and the learner hasn't answered anything in it yet.
    const answeredAny = (existing.steps ?? []).some(
      (st) => Boolean((st as { answer_id?: string | null }).answer_id),
    );
    const outdated =
      (existing.builder_version ?? '1') !== REVIEW_BUILDER_VERSION && !answeredAny;
    if ((stepCount === 0 && existing.status !== 'done') || outdated) {
      await V2ReviewSessionModel().deleteOne({
        user_id: opts.user_id,
        local_date,
      });
    } else {
      return {
        ...mapExisting(existing),
        completed_days: completedDaysAll,
        current_day: opts.currentDay,
      };
    }
  }

  const window = buildPracticeWindow({
    currentDay: opts.currentDay,
    completedDays: completedDaysAll,
    storyDays: PHASE1_STORY_DAYS,
  });

  // Day 1 / empty window — nothing saved (16 §8.2)
  if (window.length === 0) {
    return emptySessionPayload({
      local_date,
      currentDay: opts.currentDay,
      completedDaysAll,
      windowLength: 0,
    });
  }

  const currentProgress = await V2LessonProgressModel()
    .findOne({
      user_id: opts.user_id,
      target_lang,
      day: opts.currentDay,
    })
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

  // Regenerate (testing) ignores the 3-day no-repeat rule.
  const recentQuestionIds = new Set(
    opts.regenerate
      ? []
      : recentAnswers.map((a) => String(a.question_id)).filter(Boolean),
  );

  if (opts.regenerate) {
    await V2CoveragePlanModel().deleteMany({
      user_id: opts.user_id,
      lesson_day: { $in: window.map((w) => w.day) },
    });
  }

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
    const planDoc = await V2CoveragePlanModel()
      .findOne({ user_id: opts.user_id, lesson_day: w.day })
      .lean();
    // Draft or published — any lesson that exists in the DB can be reviewed.
    const published = await getLessonForPractice(w.day, target_lang);
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
        examples: Array.isArray((it as { examples?: unknown }).examples)
          ? ((it as { examples: unknown[] }).examples.map(String))
          : undefined,
        derived: Boolean((it as { derived?: boolean }).derived),
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

    // Rebuild a plan that is empty (built before the lesson existed / parsed)
    // or built from an older lesson version. Covered pairs carry over.
    const lessonVersion = published?.version ?? null;
    const expectedIds = new Set(coverageBankItems(bankItems).map((i) => i.id));
    const planIds = new Set((planDoc?.pairs ?? []).map((p) => p.item_id));
    const itemsChanged =
      expectedIds.size > 0 &&
      (expectedIds.size !== planIds.size ||
        [...expectedIds].some((id) => !planIds.has(id)));
    const planIsStale =
      !!planDoc &&
      (itemsChanged ||
        (planDoc.pairs ?? []).length === 0 ||
        (lessonVersion != null &&
          planDoc.lesson_version != null &&
          Number(planDoc.lesson_version) !== lessonVersion));

    if (!planDoc || planIsStale) {
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
      const coverageItems = coverageBankItems(bankItems).map((i) => ({
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
      // Keep pairs the learner already covered in the old plan.
      if (planDoc) {
        const done = new Map(
          (planDoc.pairs ?? [])
            .filter((p) => p.status !== 'open')
            .map((p) => [`${p.item_id}|${p.skill}|${p.form ?? ''}`, p]),
        );
        plan.pairs = plan.pairs.map((p) => {
          const prev = done.get(`${p.item_id}|${p.skill}|${p.form ?? ''}`);
          return prev
            ? {
                ...p,
                status: prev.status as CoveragePlan['pairs'][0]['status'],
                answer_id: (prev as { answer_id?: string }).answer_id,
              }
            : p;
        });
      }
      // Never persist a zero-pair plan: it would block this lesson forever.
      if (plan.pairs.length > 0) {
        await V2CoveragePlanModel().updateOne(
          { user_id: opts.user_id, lesson_day: w.day },
          {
            $set: {
              pairs: plan.pairs,
              lesson_version: lessonVersion ?? undefined,
            },
          },
          { upsert: true },
        );
      }
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
    // Same day → same mix; regenerate → a new one.
    seed: `${opts.user_id}:${local_date}${opts.regenerate ? `:${now.getTime()}` : ''}`,
  });

  // Never persist a zero-step session (sticky «مفيش جولة»).
  if (built.steps.length === 0) {
    return emptySessionPayload({
      local_date,
      currentDay: opts.currentDay,
      completedDaysAll,
      windowLength: window.length,
      stepsLength: 0,
      reason: 'empty_steps',
    });
  }

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
      if (again) {
        const againSteps = Array.isArray(again.steps) ? again.steps.length : 0;
        if (againSteps === 0) {
          return emptySessionPayload({
            local_date,
            currentDay: opts.currentDay,
            completedDaysAll,
            windowLength: window.length,
            stepsLength: 0,
            reason: 'empty_steps',
          });
        }
        return {
          ...mapExisting(again),
          completed_days: completedDaysAll,
          current_day: opts.currentDay,
        };
      }
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
    completed_days: completedDaysAll,
    current_day: opts.currentDay,
  };
}
