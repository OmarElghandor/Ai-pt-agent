/**
 * Persist / resume v2_review_sessions (16 §7).
 */

import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  V2CoveragePlanModel,
  V2LessonProgressModel,
  V2ReviewSessionModel,
} from '@/lib/v2/mongo/models';
import { localDateString } from '@/lib/v2/progress/localDate';
import {
  PHASE1_STORY_DAYS,
  buildCoveragePlan,
  buildPracticeWindow,
  buildReviewSession,
  normalizeUserPractice,
  splitDailyBudget,
  type BankItem,
  type CoverageItemKind,
  type CoveragePlan,
} from '@/lib/v2/practice';
import { loadPublishedFlashcardsThrough } from '@/lib/v2/decks';
import { getPublishedLesson } from '@/lib/v2/content/getPublishedLesson';

export async function getOrCreateTodayReview(opts: {
  user_id: string;
  currentDay: number;
  timeZone?: string;
  now?: Date;
}): Promise<{
  local_date: string;
  window: Array<{ day: number; position: 1 | 2 | 3 }>;
  budget_minutes: number;
  has_lesson_today: boolean;
  steps: unknown[];
  rounds_total: number;
  rounds_done: number;
  status: 'open' | 'done';
}> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const now = opts.now ?? new Date();
  const tz = opts.timeZone ?? 'UTC';
  const local_date = localDateString(now, tz);

  const existing = await V2ReviewSessionModel()
    .findOne({ user_id: opts.user_id, local_date })
    .lean();
  if (existing) {
    return {
      local_date,
      window: (existing.window as Array<{ day: number; position: 1 | 2 | 3 }>) ?? [],
      budget_minutes: existing.budget_minutes,
      has_lesson_today: existing.has_lesson_today,
      steps: existing.steps ?? [],
      rounds_total: existing.rounds_total,
      rounds_done: existing.rounds_done,
      status: existing.status === 'done' ? 'done' : 'open',
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
  const completedDays = completedDocs.map((d) => Number(d.day));
  const window = buildPracticeWindow({
    currentDay: opts.currentDay,
    completedDays,
    storyDays: PHASE1_STORY_DAYS,
  });

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

  const plans: CoveragePlan[] = [];
  const itemsByDay = new Map<number, BankItem[]>();
  const craftedByDay = new Map<number, import('./stepBuilders').CraftedQuestion[]>();
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
        })),
      });
    }
  }

  // Also load earlier items for cumulative grammar
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
    (i) =>
      i.type === 'pattern' &&
      !window.some((w) => w.day === i.day),
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
  });

  const doc = {
    user_id: opts.user_id,
    local_date,
    window,
    budget_minutes: split.review_minutes,
    has_lesson_today: Boolean(hasLessonToday),
    steps: built.steps.map((s) => ({
      kind: s.kind,
      lesson_day: s.lesson_day,
      pairs: s.pairs,
      slot_reason: s.slot_reason,
      estimated_seconds: s.estimated_seconds,
      round: s.round,
      question: s.payload,
      result: null,
    })),
    rounds_total: built.rounds_total,
    rounds_done: 0,
    status: 'open' as const,
  };

  await V2ReviewSessionModel().create(doc);

  return {
    local_date,
    window,
    budget_minutes: split.review_minutes,
    has_lesson_today: Boolean(hasLessonToday),
    steps: doc.steps,
    rounds_total: doc.rounds_total,
    rounds_done: 0,
    status: 'open',
  };
}
