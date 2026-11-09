import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2JobModel } from '@/lib/v2/mongo/models';
import { lessonIdFor } from '@/lib/v2/generation/lesson/graph';
import { getDayReadiness } from './readiness';
import {
  getPrepareLock,
  releasePrepareLock,
  tryAcquirePrepareLock,
} from './lock';

export type EnqueuePrepareDayResult = {
  jobId: string;
  day: number;
  target_lang: string;
  /** True when this call created the job; false when joining an existing one. */
  created: boolean;
  /** Day already fully ready — no job started. */
  already_ready: boolean;
};

/** Pure join decision used by enqueue + tests (double request → one job). */
export function decidePrepareJoin(opts: {
  ready: boolean;
  needsReviewWithoutJob: boolean;
  lockJobId: string | null;
  lockJobActive: boolean;
  runningJobId: string | null;
  force?: boolean;
}):
  | { action: 'already_ready' }
  | { action: 'needs_review' }
  | { action: 'join'; jobId: string }
  | { action: 'create' } {
  if (!opts.force && opts.ready) return { action: 'already_ready' };
  if (!opts.force && opts.needsReviewWithoutJob) {
    return { action: 'needs_review' };
  }
  if (opts.lockJobId && opts.lockJobActive) {
    return { action: 'join', jobId: opts.lockJobId };
  }
  if (opts.runningJobId) {
    return { action: 'join', jobId: opts.runningJobId };
  }
  return { action: 'create' };
}

/**
 * Fire an inline prepare drain unless startWorker is explicitly false.
 * `launch` is a test seam — production uses runWorkerUntilIdle.
 */
export function startPrepareWorkerIfRequested(
  startWorker?: boolean,
  launch?: () => void,
): void {
  if (startWorker === false) return;
  if (launch) {
    launch();
    return;
  }
  void import('@/lib/v2/generation/jobs')
    .then(({ runWorkerUntilIdle }) => {
      const workerId = `prepare-${process.pid}-${Date.now().toString(36)}`;
      return runWorkerUntilIdle(workerId, {
        maxEmptyRounds: 5,
        idleMs: 2000,
        deadlineMs: 25 * 60 * 1000,
      });
    })
    .catch((err) => {
      console.error(
        '[v2-prepare] worker failed',
        err instanceof Error ? err.message : err,
      );
    });
}

/**
 * Idempotent: one prepare_day job at a time per language × day.
 * A second caller joins the running job via the TTL lock.
 */
export async function enqueueOrJoinPrepareDay(opts: {
  day: number;
  targetLang?: string;
  /** When true, enqueue even if readiness says ready (admin regen). */
  force?: boolean;
  /** Fire an inline worker drain after enqueue (learner/admin convenience). */
  startWorker?: boolean;
}): Promise<EnqueuePrepareDayResult> {
  if (!mongoConfigured()) {
    throw new Error('MongoDB not configured');
  }
  await connectMongo();
  const target_lang = opts.targetLang ?? 'pt-PT';
  const day = opts.day;

  const readiness = await getDayReadiness(day, target_lang);
  const existingLock = await getPrepareLock(day, target_lang);
  let lockJobActive = false;
  if (existingLock) {
    const job = await V2JobModel()
      .findById(existingLock.job_id)
      .select({ status: 1 })
      .lean();
    lockJobActive = Boolean(
      job && (job.status === 'queued' || job.status === 'running'),
    );
    if (!lockJobActive) {
      await releasePrepareLock(day, target_lang);
    }
  }

  const running = await V2JobModel()
    .findOne({
      day,
      target_lang,
      kind: 'prepare_day',
      status: { $in: ['queued', 'running'] },
    })
    .sort({ createdAt: -1 })
    .select({ _id: 1 })
    .lean();

  const decision = decidePrepareJoin({
    ready: readiness.ready,
    needsReviewWithoutJob:
      readiness.lesson === 'needs_review' && readiness.job_id == null,
    lockJobId: existingLock?.job_id ?? null,
    lockJobActive,
    runningJobId: running ? String(running._id) : null,
    force: opts.force,
  });

  if (decision.action === 'already_ready') {
    return {
      jobId: readiness.job_id ?? '',
      day,
      target_lang,
      created: false,
      already_ready: true,
    };
  }
  if (decision.action === 'needs_review') {
    return {
      jobId: '',
      day,
      target_lang,
      created: false,
      already_ready: false,
    };
  }
  if (decision.action === 'join') {
    await tryAcquirePrepareLock({
      day,
      targetLang: target_lang,
      jobId: decision.jobId,
    });
    // Restart drain even when joining — orphaned queued/running jobs after
    // a next restart otherwise sit forever with no worker.
    startPrepareWorkerIfRequested(opts.startWorker);
    return {
      jobId: decision.jobId,
      day,
      target_lang,
      created: false,
      already_ready: false,
    };
  }

  const lesson_id = lessonIdFor(day, target_lang);
  const doc = await V2JobModel().create({
    kind: 'prepare_day',
    lesson_id,
    day,
    target_lang,
    version: 1,
    depends_on: [],
    status: 'queued',
    progress: {
      prepare: {
        step: 'lesson',
        lesson_done: false,
        pack_done: false,
        audio_done: false,
      },
    },
  });
  const jobId = String(doc._id);

  const acquired = await tryAcquirePrepareLock({
    day,
    targetLang: target_lang,
    jobId,
  });
  if (acquired === null) {
    // Lost the race — delete our job and join the winner.
    await V2JobModel().deleteOne({ _id: doc._id });
    const lock = await getPrepareLock(day, target_lang);
    if (lock) {
      startPrepareWorkerIfRequested(opts.startWorker);
      return {
        jobId: lock.job_id,
        day,
        target_lang,
        created: false,
        already_ready: false,
      };
    }
    // Extremely unlikely — fall through as created.
  }

  startPrepareWorkerIfRequested(opts.startWorker);

  return {
    jobId,
    day,
    target_lang,
    created: true,
    already_ready: false,
  };
}
