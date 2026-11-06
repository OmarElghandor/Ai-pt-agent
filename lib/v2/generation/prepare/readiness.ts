import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { convoPackFileExists } from '@/lib/v2/convo/pack/load';
import {
  isBlockedForPublish,
  type PublishBlockMeta,
} from '@/lib/v2/generation/lesson/issueResolve';
import {
  V2ConvoPackModel,
  V2JobModel,
  V2LessonModel,
} from '@/lib/v2/mongo/models';
import type {
  AudioReadiness,
  DayReadiness,
  DayReadinessSnapshot,
  LessonReadiness,
  PackReadiness,
} from './types';

export type { DayReadiness, DayReadinessSnapshot } from './types';

const NEEDS_REVIEW_EG =
  'الدرس ده محتاج مراجعة قبل ما يتنشر 🙏 هيبقى جاهز قريب';

const PREPARE_FAILED_EG = 'حصل خطأ أثناء تجهيز اليوم — حاول تاني بعد شوية';

const LESSON_GEN_KINDS = new Set([
  'prepare_day',
  'items',
  'story',
  'outline',
  'page',
  'critic',
  'questions',
  'micro',
  'daily_use',
  'real_world',
  'continuity',
  'assemble',
  'lang_check',
]);

const PACK_GEN_KINDS = new Set([
  'prepare_day',
  'convo_outline',
  'convo_items',
  'convo_critic',
  'convo_lang_check',
  'convo_assemble',
]);

const RUNNING_KINDS = [
  'prepare_day',
  'items',
  'story',
  'outline',
  'page',
  'critic',
  'questions',
  'micro',
  'daily_use',
  'real_world',
  'continuity',
  'assemble',
  'lang_check',
  'convo_outline',
  'convo_items',
  'convo_critic',
  'convo_lang_check',
  'convo_assemble',
] as const;

/** Remaining Brazilian flags after assemble / lang_check — hard for auto-publish. */
export function hasBrazilianFlags(
  meta: PublishBlockMeta | null | undefined,
): boolean {
  return (meta?.issues ?? []).some((i) => i.rule === 'brazilian');
}

/** Fatals or Brazilian → needs_review for the prepare gate. */
export function needsReviewForAutoPublish(
  meta: PublishBlockMeta | null | undefined,
): boolean {
  return isBlockedForPublish(meta) || hasBrazilianFlags(meta);
}

export function dayPackId(day: number, targetLang = 'pt-PT'): string {
  return `${targetLang}.day-${day}`;
}

/** Pure readiness from a loaded snapshot (tests inject mocks here). */
export function computeDayReadiness(
  snap: DayReadinessSnapshot,
): DayReadiness {
  const running = snap.running_job;
  const runningLesson =
    running != null && LESSON_GEN_KINDS.has(running.kind);
  const runningPack =
    running != null && PACK_GEN_KINDS.has(running.kind);

  let lesson: LessonReadiness = 'none';
  let error_eg: string | null = null;

  if (snap.lesson?.status === 'published') {
    lesson = 'published';
  } else if (snap.lesson) {
    const meta = (snap.lesson.meta ?? null) as PublishBlockMeta | null;
    if (needsReviewForAutoPublish(meta)) {
      lesson = 'needs_review';
      error_eg =
        snap.lesson.meta?.prepare_error_eg?.trim() ||
        snap.prepare_error_eg?.trim() ||
        NEEDS_REVIEW_EG;
    } else if (runningLesson) {
      lesson = 'generating';
    } else {
      lesson = 'draft';
    }
  } else if (runningLesson) {
    lesson = 'generating';
  }

  if (!error_eg && snap.prepare_error_eg?.trim()) {
    error_eg = snap.prepare_error_eg.trim();
  }

  let pack: PackReadiness = 'none';
  const packReady =
    snap.authored_pack ||
    snap.pack?.status === 'published' ||
    snap.pack?.meta?.text_ready === true;
  if (packReady) {
    pack = 'ready';
  } else if (runningPack) {
    pack = 'generating';
  }

  let audio: AudioReadiness = 'none';
  if (pack === 'ready') {
    if (snap.authored_pack) {
      audio = 'ready';
    } else if (snap.pack?.meta?.audio_ready === true) {
      audio = 'ready';
    } else if (
      running?.kind === 'prepare_day' ||
      running?.kind === 'convo_assemble'
    ) {
      audio = 'warming';
    } else if (snap.pack?.meta?.text_ready === true) {
      audio = 'warming';
    }
  } else if (running?.kind === 'prepare_day' && lesson === 'published') {
    audio = 'warming';
  }

  const ready = lesson === 'published' && pack === 'ready';

  if (lesson === 'needs_review' && !error_eg) {
    error_eg = NEEDS_REVIEW_EG;
  }

  return {
    target_lang: snap.target_lang,
    day: snap.day,
    lesson,
    pack,
    audio,
    job_id: running?.id ?? null,
    error_eg,
    ready,
  };
}

async function loadLatestLesson(
  day: number,
  targetLang: string,
): Promise<DayReadinessSnapshot['lesson']> {
  const doc = await V2LessonModel()
    .findOne({ day, target_lang: targetLang })
    .sort({ version: -1 })
    .select({ status: 1, meta: 1 })
    .lean();
  if (!doc) return null;
  const status = doc.status as 'draft' | 'reviewed' | 'published';
  return {
    status:
      status === 'published' || status === 'reviewed' ? status : 'draft',
    meta:
      (doc.meta as NonNullable<DayReadinessSnapshot['lesson']>['meta']) ??
      null,
  };
}

async function loadLatestConvoPack(
  day: number,
  targetLang: string,
): Promise<DayReadinessSnapshot['pack']> {
  const doc = await V2ConvoPackModel()
    .findOne({ day, target_lang: targetLang })
    .sort({ version: -1 })
    .select({ status: 1, meta: 1 })
    .lean();
  if (!doc) return null;
  const status = doc.status as 'draft' | 'reviewed' | 'published';
  return {
    status:
      status === 'published' || status === 'reviewed' ? status : 'draft',
    meta:
      (doc.meta as { text_ready?: boolean; audio_ready?: boolean }) ?? null,
  };
}

async function loadRunningJob(
  day: number,
  targetLang: string,
): Promise<DayReadinessSnapshot['running_job']> {
  const doc = await V2JobModel()
    .findOne({
      day,
      target_lang: targetLang,
      status: { $in: ['queued', 'running'] },
      kind: { $in: [...RUNNING_KINDS] },
    })
    .sort({ createdAt: -1 })
    .select({ _id: 1, kind: 1 })
    .lean();
  if (!doc) return null;
  return { id: String(doc._id), kind: String(doc.kind) };
}

async function loadPrepareErrorEg(
  day: number,
  targetLang: string,
): Promise<string | null> {
  const doc = await V2JobModel()
    .findOne({
      day,
      target_lang: targetLang,
      kind: 'prepare_day',
      status: 'failed',
    })
    .sort({ createdAt: -1 })
    .select({ error: 1, output: 1 })
    .lean();
  if (!doc) return null;
  const out = doc.output as { error_eg?: string } | undefined;
  if (typeof out?.error_eg === 'string' && out.error_eg.trim()) {
    return out.error_eg.trim();
  }
  if (typeof doc.error === 'string' && doc.error.trim()) {
    return PREPARE_FAILED_EG;
  }
  return null;
}

/** Load Mongo + file state, then compute readiness. */
export async function loadDayReadinessSnapshot(
  day: number,
  targetLang = 'pt-PT',
): Promise<DayReadinessSnapshot> {
  const authored = convoPackFileExists(dayPackId(day, targetLang));
  if (!mongoConfigured()) {
    return {
      target_lang: targetLang,
      day,
      lesson: null,
      pack: null,
      authored_pack: authored,
      running_job: null,
      prepare_error_eg: null,
    };
  }
  await connectMongo();
  const [lesson, pack, running_job, prepare_error_eg] = await Promise.all([
    loadLatestLesson(day, targetLang),
    loadLatestConvoPack(day, targetLang),
    loadRunningJob(day, targetLang),
    loadPrepareErrorEg(day, targetLang),
  ]);
  return {
    target_lang: targetLang,
    day,
    lesson,
    pack,
    authored_pack: authored,
    running_job,
    prepare_error_eg,
  };
}

export async function getDayReadiness(
  day: number,
  targetLang = 'pt-PT',
): Promise<DayReadiness> {
  const snap = await loadDayReadinessSnapshot(day, targetLang);
  return computeDayReadiness(snap);
}

export async function getDaysReadiness(
  days: number[],
  targetLang = 'pt-PT',
): Promise<DayReadiness[]> {
  const unique = [
    ...new Set(days.filter((d) => Number.isInteger(d) && d > 0)),
  ];
  return Promise.all(unique.map((d) => getDayReadiness(d, targetLang)));
}
