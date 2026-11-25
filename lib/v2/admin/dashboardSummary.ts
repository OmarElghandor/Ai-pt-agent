import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { listAdminCustomDecks, listAdminOfficialDecks } from '@/lib/v2/decks/admin';
import { listAdminSituationDecks } from '@/lib/v2/decks/situationAdmin';
import { listReviewQueue } from '@/lib/v2/generation/prepare/reviewQueue';
import { loadPlan } from '@/lib/v2/generation/lesson/plan';
import { listLatestLessons } from '@/lib/v2/generation/lesson/save';
import { V2ImageModel, V2JobModel } from '@/lib/v2/mongo/models';
import { V2LibraryJobModel } from '@/lib/v2/mongo/libraryModels';

export type LessonCounts = {
  published: number;
  ready_for_review: number;
  failed: number;
  not_generated: number;
};

export type CardCounts = {
  days_ready: number;
  themed_decks: number;
  learner_waiting: number;
};

export type ImageCounts = {
  ready: number;
  missing: number;
  flagged: number;
  blocked: number;
};

export type TodayCost = {
  claude_usd: number;
  images_usd: number;
  tts_usd: number;
  total_usd: number;
  image_cap_limit: number | null;
  image_cap_used: number;
  image_cap_left: number | null;
};

export type AttentionItem = {
  id: string;
  kind: 'lesson_review' | 'flagged_image' | 'reported_deck' | 'failed_job';
  label: string;
  href: string;
  action_label: string;
};

export type JobSummaryRow = {
  id: string;
  source: 'lesson' | 'library';
  kind: string;
  status: string;
  label: string;
  cost_usd: number;
  finished_at: string | null;
  started_at: string | null;
};

export type DashboardSummary = {
  lessons: LessonCounts;
  cards: CardCounts;
  images: ImageCounts;
  today: TodayCost;
  needs_you: AttentionItem[];
  recent_jobs: JobSummaryRow[];
  running_count: number;
};

export type LessonStatusSeed = {
  day: number;
  status: 'draft' | 'reviewed' | 'published' | null;
  flagged?: boolean;
  prepare_error_eg?: string | null;
};

/** Pure: classify plan days into the four home lesson buckets. */
export function countLessonStatuses(
  planDays: number[],
  lessons: LessonStatusSeed[],
): LessonCounts {
  const byDay = new Map(lessons.map((l) => [l.day, l]));
  const counts: LessonCounts = {
    published: 0,
    ready_for_review: 0,
    failed: 0,
    not_generated: 0,
  };
  for (const day of planDays) {
    const lesson = byDay.get(day);
    if (!lesson || lesson.status == null) {
      counts.not_generated += 1;
      continue;
    }
    if (lesson.status === 'published') {
      counts.published += 1;
      continue;
    }
    if (lesson.flagged || lesson.prepare_error_eg) {
      counts.failed += 1;
      continue;
    }
    counts.ready_for_review += 1;
  }
  return counts;
}

export function imageCapLimitFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): number | null {
  const raw = env.CUSTOM_DECK_IMAGE_DAILY_LIMIT?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function startOfLocalDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export async function loadDashboardSummary(
  targetLang = 'pt-PT',
): Promise<DashboardSummary> {
  const plan = loadPlan();
  const planDays = plan.days.map((d) => d.day);
  const empty: DashboardSummary = {
    lessons: countLessonStatuses(planDays, []),
    cards: { days_ready: 0, themed_decks: 0, learner_waiting: 0 },
    images: { ready: 0, missing: 0, flagged: 0, blocked: 0 },
    today: {
      claude_usd: 0,
      images_usd: 0,
      tts_usd: 0,
      total_usd: 0,
      image_cap_limit: imageCapLimitFromEnv(),
      image_cap_used: 0,
      image_cap_left: imageCapLimitFromEnv(),
    },
    needs_you: [],
    recent_jobs: [],
    running_count: 0,
  };

  if (!mongoConfigured()) {
    return empty;
  }

  await connectMongo();
  const dayStart = startOfLocalDay();
  const capLimit = imageCapLimitFromEnv();

  const [
    lessons,
    situation,
    official,
    customReported,
    imageGroups,
    reviewItems,
    flaggedImages,
    failedLessonJobs,
    failedLibraryJobs,
    runningLesson,
    runningLibrary,
    doneLessonJobs,
    doneLibraryJobs,
    todayLessonJobs,
    todayLibraryJobs,
    todayImageDocs,
  ] = await Promise.all([
    listLatestLessons(targetLang),
    listAdminSituationDecks(targetLang),
    listAdminOfficialDecks(),
    listAdminCustomDecks({ filter: 'reported' }),
    V2ImageModel().aggregate<{ _id: string; n: number }>([
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
    listReviewQueue(targetLang),
    V2ImageModel()
      .find({ status: 'flagged' })
      .sort({ updatedAt: -1 })
      .limit(10)
      .select({ key: 1 })
      .lean(),
    V2JobModel()
      .find({ status: 'failed' })
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean(),
    V2LibraryJobModel()
      .find({ status: 'failed' })
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean(),
    V2JobModel().countDocuments({ status: 'running' }),
    V2LibraryJobModel().countDocuments({ status: 'running' }),
    V2JobModel()
      .find({ status: 'done' })
      .sort({ finished_at: -1, updatedAt: -1 })
      .limit(10)
      .lean(),
    V2LibraryJobModel()
      .find({ status: 'done' })
      .sort({ finished_at: -1, updatedAt: -1 })
      .limit(10)
      .lean(),
    V2JobModel()
      .find({
        status: 'done',
        $or: [
          { finished_at: { $gte: dayStart } },
          { updatedAt: { $gte: dayStart } },
        ],
      })
      .select({ usd_estimate: 1, kind: 1 })
      .lean(),
    V2LibraryJobModel()
      .find({
        status: 'done',
        $or: [
          { finished_at: { $gte: dayStart } },
          { updatedAt: { $gte: dayStart } },
        ],
      })
      .select({ cost: 1, kind: 1 })
      .lean(),
    V2ImageModel()
      .find({
        status: 'ready',
        updatedAt: { $gte: dayStart },
        cost_usd: { $gt: 0 },
      })
      .select({ cost_usd: 1 })
      .lean(),
  ]);

  const lessonCounts = countLessonStatuses(
    planDays,
    lessons.map((l) => ({
      day: l.day,
      status: l.status,
      flagged: Boolean(l.meta?.flagged),
      prepare_error_eg: l.meta?.prepare_error_eg ?? null,
    })),
  );

  const daysReady = situation.filter(
    (d) => d.source === 'bank' || d.source === 'published' || d.card_count > 0,
  ).length;

  const imageByStatus = new Map(imageGroups.map((g) => [g._id, g.n]));
  const images: ImageCounts = {
    ready: imageByStatus.get('ready') ?? 0,
    missing: imageByStatus.get('missing') ?? 0,
    flagged: imageByStatus.get('flagged') ?? 0,
    blocked: imageByStatus.get('blocked') ?? 0,
  };

  let claudeUsd = 0;
  let imagesUsd = 0;
  let ttsUsd = 0;

  for (const j of todayLessonJobs) {
    const usd = Number(j.usd_estimate ?? 0);
    if (j.kind === 'image' || j.kind === 'image_specs') imagesUsd += usd;
    else claudeUsd += usd;
  }
  for (const j of todayLibraryJobs) {
    const usd = Number((j.cost as { usd?: number } | undefined)?.usd ?? 0);
    if (j.kind === 'library_image') imagesUsd += usd;
    else if (
      j.kind === 'library_audio_line' ||
      j.kind === 'library_stitch'
    ) {
      ttsUsd += usd;
    }
    else claudeUsd += usd;
  }
  for (const img of todayImageDocs) {
    imagesUsd += Number(img.cost_usd ?? 0);
  }

  const imageCapUsed = todayImageDocs.length;
  const imageCapLeft =
    capLimit == null ? null : Math.max(0, capLimit - imageCapUsed);

  const needs_you: AttentionItem[] = [];

  for (const item of reviewItems.slice(0, 15)) {
    needs_you.push({
      id: `review-${item.day}-${item.version}`,
      kind: 'lesson_review',
      label: `درس يوم ${item.day} · محتاج مراجعة`,
      href: `/v2-admin/lessons/${item.day}`,
      action_label: 'راجع',
    });
  }
  for (const img of flaggedImages) {
    needs_you.push({
      id: `img-${img.key}`,
      kind: 'flagged_image',
      label: `صورة معلّمة · ${img.key}`,
      href: `/v2-admin/images?status=flagged&key=${encodeURIComponent(String(img.key))}`,
      action_label: 'شوف',
    });
  }
  for (const deck of customReported.slice(0, 10)) {
    needs_you.push({
      id: `deck-${deck.id}`,
      kind: 'reported_deck',
      label: `مجموعة متعلمين · ${deck.title_ar || deck.title_tl}`,
      href: `/v2-admin/custom-decks`,
      action_label: 'راجع',
    });
  }
  for (const j of failedLessonJobs) {
    needs_you.push({
      id: `job-lesson-${String(j._id)}`,
      kind: 'failed_job',
      label: `شغل فشل · يوم ${j.day} · ${j.kind}`,
      href: `/v2-admin/jobs`,
      action_label: 'افتح',
    });
  }
  for (const j of failedLibraryJobs) {
    needs_you.push({
      id: `job-lib-${String(j._id)}`,
      kind: 'failed_job',
      label: `شغل مكتبة فشل · ${j.episode_slug} · ${j.kind}`,
      href: `/v2-admin/library/${j.episode_slug}`,
      action_label: 'افتح',
    });
  }

  const mergedJobs: JobSummaryRow[] = [
    ...doneLessonJobs.map((j) => ({
      id: String(j._id),
      source: 'lesson' as const,
      kind: String(j.kind),
      status: String(j.status),
      label: `يوم ${j.day} · ${j.kind}`,
      cost_usd: Number(j.usd_estimate ?? 0),
      finished_at: j.finished_at ? new Date(j.finished_at).toISOString() : null,
      started_at: j.started_at ? new Date(j.started_at).toISOString() : null,
    })),
    ...doneLibraryJobs.map((j) => ({
      id: String(j._id),
      source: 'library' as const,
      kind: String(j.kind),
      status: String(j.status),
      label: `${j.episode_slug} · ${j.kind}`,
      cost_usd: Number((j.cost as { usd?: number } | undefined)?.usd ?? 0),
      finished_at: j.finished_at ? new Date(j.finished_at).toISOString() : null,
      started_at: j.started_at ? new Date(j.started_at).toISOString() : null,
    })),
  ]
    .sort((a, b) => {
      const ta = a.finished_at ? Date.parse(a.finished_at) : 0;
      const tb = b.finished_at ? Date.parse(b.finished_at) : 0;
      return tb - ta;
    })
    .slice(0, 10);

  return {
    lessons: lessonCounts,
    cards: {
      days_ready: daysReady,
      themed_decks: official.length,
      learner_waiting: customReported.length,
    },
    images,
    today: {
      claude_usd: round4(claudeUsd),
      images_usd: round4(imagesUsd),
      tts_usd: round4(ttsUsd),
      total_usd: round4(claudeUsd + imagesUsd + ttsUsd),
      image_cap_limit: capLimit,
      image_cap_used: imageCapUsed,
      image_cap_left: imageCapLeft,
    },
    needs_you: needs_you.slice(0, 30),
    recent_jobs: mergedJobs,
    running_count: runningLesson + runningLibrary,
  };
}
