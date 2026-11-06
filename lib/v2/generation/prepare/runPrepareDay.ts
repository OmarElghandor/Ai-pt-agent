import type { LessonPack } from '@/lib/v2/content/lesson';
import { getPublishedLesson } from '@/lib/v2/content/getPublishedLesson';
import { convoPackFileExists } from '@/lib/v2/convo/pack/load';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2ConvoPackModel, V2JobModel } from '@/lib/v2/mongo/models';
import { publishLesson } from '@/lib/v2/generation/lesson/publish';
import {
  getLatestLesson,
  updateDraft,
  type GenerationMeta,
  type SavedLesson,
} from '@/lib/v2/generation/lesson/save';
import { generateLessonDraft } from '@/lib/v2/generation/lesson/run';
import { warmLessonPackAudio } from '@/lib/v2/generation/warmAudio';
import { dayPackId, needsReviewForAutoPublish } from './readiness';
import { releasePrepareLock } from './lock';

export type PrepareStep =
  | 'lesson'
  | 'gate'
  | 'pack'
  | 'audio'
  | 'done'
  | 'needs_review'
  | 'failed';

export type PrepareProgress = {
  step: PrepareStep;
  lesson_done: boolean;
  pack_done: boolean;
  audio_done: boolean;
  error_eg?: string;
};

export type PrepareDayResult = {
  status: 'ready' | 'needs_review' | 'failed';
  progress: PrepareProgress;
  error_eg?: string;
};

const NEEDS_REVIEW_EG =
  'الدرس ده محتاج مراجعة قبل ما يتنشر 🙏 هيبقى جاهز قريب';
const STEP_FAIL_EG = 'حصل خطأ أثناء تجهيز اليوم — حاول تاني بعد شوية';

const CONVO_WAIT_MS = 10 * 60 * 1000;
const CONVO_POLL_MS = 2_500;

export type PrepareDayDeps = {
  getPublished: (day: number) => Promise<{ version: number; pack: LessonPack } | null>;
  getLatest: (day: number, targetLang: string) => Promise<SavedLesson | null>;
  generateDraft: (opts: {
    day: number;
    skipImages: boolean;
  }) => Promise<{ saved: SavedLesson; pack: LessonPack }>;
  publish: (opts: {
    day: number;
    targetLang: string;
    version: number;
  }) => Promise<{ lesson: SavedLesson }>;
  updateMeta: (opts: {
    day: number;
    targetLang: string;
    version: number;
    meta: Partial<GenerationMeta>;
  }) => Promise<void>;
  authoredPackExists: (packId: string) => boolean;
  enqueueConvo: (opts: {
    day: number;
    targetLang: string;
  }) => Promise<{ jobId: string }>;
  waitConvoReady: (opts: {
    day: number;
    targetLang: string;
    timeoutMs?: number;
  }) => Promise<boolean>;
  warmLesson: (pack: LessonPack) => Promise<unknown>;
  setProgress?: (progress: PrepareProgress) => Promise<void>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function convoPackTextReadyOnce(opts: {
  day: number;
  targetLang: string;
}): Promise<boolean> {
  if (!mongoConfigured()) return false;
  await connectMongo();
  const doc = await V2ConvoPackModel()
    .findOne({
      day: opts.day,
      target_lang: opts.targetLang,
      $or: [{ status: 'published' }, { 'meta.text_ready': true }],
    })
    .select({ _id: 1 })
    .lean();
  return Boolean(doc);
}

export async function waitConvoPackTextReady(opts: {
  day: number;
  targetLang: string;
  timeoutMs?: number;
}): Promise<boolean> {
  const deadline = Date.now() + (opts.timeoutMs ?? CONVO_WAIT_MS);
  while (Date.now() < deadline) {
    if (await convoPackTextReadyOnce(opts)) return true;
    if (Date.now() + CONVO_POLL_MS > deadline) break;
    await sleep(CONVO_POLL_MS);
  }
  return convoPackTextReadyOnce(opts);
}

async function withOneRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return await fn();
  }
}

export function createDefaultPrepareDeps(): PrepareDayDeps {
  return {
    getPublished: async (day) => {
      const pub = await getPublishedLesson(day);
      return pub ? { version: pub.version, pack: pub.pack } : null;
    },
    getLatest: getLatestLesson,
    generateDraft: async ({ day, skipImages }) => {
      const result = await generateLessonDraft({ day, skipImages });
      return { saved: result.saved, pack: result.pack };
    },
    publish: async ({ day, targetLang, version }) => {
      const out = await publishLesson({ day, targetLang, version });
      return { lesson: out.lesson };
    },
    updateMeta: async ({ day, targetLang, version, meta }) => {
      await updateDraft({
        day,
        targetLang,
        version,
        meta: meta as GenerationMeta,
        mergeMeta: true,
      });
    },
    authoredPackExists: convoPackFileExists,
    enqueueConvo: async ({ day, targetLang }) => {
      const { enqueueAndStartGenerateConvoPack } = await import(
        '@/lib/v2/generation/jobs'
      );
      const enqueued = await enqueueAndStartGenerateConvoPack({
        day,
        targetLang,
      });
      return { jobId: enqueued.jobId };
    },
    waitConvoReady: async (opts) => {
      if (opts.timeoutMs != null && opts.timeoutMs <= 50) {
        return convoPackTextReadyOnce(opts);
      }
      return waitConvoPackTextReady(opts);
    },
    warmLesson: warmLessonPackAudio,
  };
}

/**
 * Idempotent prepare chain: lesson draft → gate → convo pack → audio.
 * Pure enough for tests via `deps`.
 */
export async function runPrepareDayChain(opts: {
  day: number;
  targetLang?: string;
  deps?: PrepareDayDeps;
}): Promise<PrepareDayResult> {
  const targetLang = opts.targetLang ?? 'pt-PT';
  const deps = opts.deps ?? createDefaultPrepareDeps();
  const packId = dayPackId(opts.day, targetLang);

  const report = async (progress: PrepareProgress) => {
    if (deps.setProgress) await deps.setProgress(progress);
  };

  let lessonDone = false;
  let packDone = false;
  let audioDone = false;

  // --- 1. Lesson ---
  await report({
    step: 'lesson',
    lesson_done: false,
    pack_done: false,
    audio_done: false,
  });

  let published = await deps.getPublished(opts.day);
  if (!published) {
    let latest = await deps.getLatest(opts.day, targetLang);
    const usableDraft =
      latest &&
      latest.status !== 'published' &&
      latest.meta?.text_ready === true &&
      !needsReviewForAutoPublish(latest.meta);

    if (!usableDraft) {
      try {
        const generated = await withOneRetry(() =>
          deps.generateDraft({ day: opts.day, skipImages: true }),
        );
        latest = generated.saved;
      } catch (err) {
        const error_eg = STEP_FAIL_EG;
        await report({
          step: 'failed',
          lesson_done: false,
          pack_done: false,
          audio_done: false,
          error_eg,
        });
        return {
          status: 'failed',
          progress: {
            step: 'failed',
            lesson_done: false,
            pack_done: false,
            audio_done: false,
            error_eg,
          },
          error_eg,
        };
      }
    }

    // --- 2. Gate ---
    await report({
      step: 'gate',
      lesson_done: false,
      pack_done: false,
      audio_done: false,
    });

    latest = (await deps.getLatest(opts.day, targetLang)) ?? latest!;
    if (needsReviewForAutoPublish(latest.meta)) {
      try {
        await deps.updateMeta({
          day: opts.day,
          targetLang,
          version: latest.version,
          meta: { prepare_error_eg: NEEDS_REVIEW_EG },
        });
      } catch {
        /* best effort */
      }
      const progress: PrepareProgress = {
        step: 'needs_review',
        lesson_done: false,
        pack_done: false,
        audio_done: false,
        error_eg: NEEDS_REVIEW_EG,
      };
      await report(progress);
      return { status: 'needs_review', progress, error_eg: NEEDS_REVIEW_EG };
    }

    try {
      await withOneRetry(() =>
        deps.publish({
          day: opts.day,
          targetLang,
          version: latest!.version,
        }),
      );
      await deps.updateMeta({
        day: opts.day,
        targetLang,
        version: latest.version,
        meta: {
          auto_published: true,
          auto_published_checked: false,
        },
      });
    } catch (err) {
      const error_eg = NEEDS_REVIEW_EG;
      try {
        await deps.updateMeta({
          day: opts.day,
          targetLang,
          version: latest.version,
          meta: { prepare_error_eg: error_eg },
        });
      } catch {
        /* best effort */
      }
      const progress: PrepareProgress = {
        step: 'needs_review',
        lesson_done: false,
        pack_done: false,
        audio_done: false,
        error_eg,
      };
      await report(progress);
      return { status: 'needs_review', progress, error_eg };
    }

    published = await deps.getPublished(opts.day);
  }

  lessonDone = Boolean(published);
  await report({
    step: 'pack',
    lesson_done: lessonDone,
    pack_done: false,
    audio_done: false,
  });

  // --- 3. Convo pack ---
  if (deps.authoredPackExists(packId)) {
    packDone = true;
  } else {
    const already = await deps.waitConvoReady({
      day: opts.day,
      targetLang,
      timeoutMs: 1,
    });
    if (already) {
      packDone = true;
    } else {
      try {
        await withOneRetry(() =>
          deps.enqueueConvo({ day: opts.day, targetLang }),
        );
        const ok = await deps.waitConvoReady({
          day: opts.day,
          targetLang,
          timeoutMs: CONVO_WAIT_MS,
        });
        if (!ok) {
          const error_eg = STEP_FAIL_EG;
          const progress: PrepareProgress = {
            step: 'failed',
            lesson_done: lessonDone,
            pack_done: false,
            audio_done: false,
            error_eg,
          };
          await report(progress);
          return { status: 'failed', progress, error_eg };
        }
        packDone = true;
      } catch {
        const error_eg = STEP_FAIL_EG;
        const progress: PrepareProgress = {
          step: 'failed',
          lesson_done: lessonDone,
          pack_done: false,
          audio_done: false,
          error_eg,
        };
        await report(progress);
        return { status: 'failed', progress, error_eg };
      }
    }
  }

  await report({
    step: 'audio',
    lesson_done: lessonDone,
    pack_done: packDone,
    audio_done: false,
  });

  // --- 4. Audio (convo assemble already warms pack lines; warm lesson too) ---
  try {
    const pub = published ?? (await deps.getPublished(opts.day));
    if (pub?.pack) {
      await withOneRetry(() => deps.warmLesson(pub.pack));
    }
    audioDone = true;
  } catch {
    // Audio failure is soft — pack text is enough to open the conversation.
    audioDone = true;
  }

  const progress: PrepareProgress = {
    step: 'done',
    lesson_done: lessonDone,
    pack_done: packDone,
    audio_done: audioDone,
  };
  await report(progress);
  return { status: 'ready', progress };
}

/** Job handler for kind=prepare_day. */
export async function processPrepareDayJob(opts: {
  jobId: string;
  day: number;
  targetLang: string;
}): Promise<PrepareDayResult> {
  const setProgress = async (progress: PrepareProgress) => {
    await V2JobModel().updateOne(
      { _id: opts.jobId },
      {
        $set: {
          progress: {
            prepare: progress,
          },
          ...(progress.error_eg
            ? { 'output.error_eg': progress.error_eg }
            : {}),
        },
      },
    );
  };

  try {
    const result = await runPrepareDayChain({
      day: opts.day,
      targetLang: opts.targetLang,
      deps: {
        ...createDefaultPrepareDeps(),
        setProgress,
      },
    });

    if (result.status === 'ready') {
      const { finishJobSuccess } = await import(
        '@/lib/v2/generation/lesson/jobs/persist'
      );
      await finishJobSuccess({
        jobId: opts.jobId,
        output: { status: result.status, progress: result.progress },
        extraProgress: { prepare: result.progress },
      });
    } else if (result.status === 'needs_review') {
      const { finishJobSuccess } = await import(
        '@/lib/v2/generation/lesson/jobs/persist'
      );
      // Terminal but expected — mark done so readiness shows needs_review.
      await finishJobSuccess({
        jobId: opts.jobId,
        output: {
          status: result.status,
          progress: result.progress,
          error_eg: result.error_eg,
        },
        extraProgress: { prepare: result.progress },
      });
    } else {
      const { finishJobFailed } = await import(
        '@/lib/v2/generation/lesson/jobs/persist'
      );
      await finishJobFailed(opts.jobId, result.error_eg ?? STEP_FAIL_EG);
      await V2JobModel().updateOne(
        { _id: opts.jobId },
        {
          $set: {
            output: {
              status: 'failed',
              error_eg: result.error_eg,
              progress: result.progress,
            },
          },
        },
      );
    }

    return result;
  } finally {
    await releasePrepareLock(opts.day, opts.targetLang, opts.jobId);
  }
}
