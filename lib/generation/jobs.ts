import { randomBytes } from 'node:crypto';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  PracticeGenerationJobModel,
  type PracticeGenerationJobDoc,
} from '@/lib/mongo/models';

export const STALE_LOCK_MS = 5 * 60 * 1000;

function newOwner(): string {
  return randomBytes(8).toString('hex');
}

function isLockStale(lock: PracticeGenerationJobDoc['lock'] | null | undefined): boolean {
  if (!lock?.owner) return true;
  const ts = lock.last_stage_at || lock.acquired_at;
  if (!ts) return true;
  return Date.now() - new Date(ts).getTime() > STALE_LOCK_MS;
}

/** Create or join an in-flight job. Routes call this and return immediately. */
export async function createOrJoinJob(
  lessonKey: string,
  { priority = 0 }: { priority?: number } = {},
): Promise<{
  jobId: string;
  lessonKey: string;
  stage: string | null;
  status: string;
  joined: boolean;
  takeover: boolean;
}> {
  if (!mongoConfigured()) {
    throw Object.assign(new Error('MONGODB_URI required'), { status: 400 });
  }
  await connectMongo();
  const Model = PracticeGenerationJobModel();

  const active = await Model.findOne({
    lesson_key: lessonKey,
    status: { $in: ['queued', 'running'] },
  }).sort({ createdAt: -1 });

  if (active && !isLockStale(active.lock)) {
    return {
      jobId: String(active._id),
      lessonKey,
      stage: active.stage ?? null,
      status: active.status,
      joined: true,
      takeover: false,
    };
  }

  if (active && isLockStale(active.lock)) {
    active.status = 'queued';
    active.stage = 'queued';
    active.error = null;
    active.priority = priority;
    active.lock = {
      owner: null,
      acquired_at: null,
      last_stage_at: null,
    };
    await active.save();
    return {
      jobId: String(active._id),
      lessonKey,
      stage: 'queued',
      status: 'queued',
      joined: false,
      takeover: true,
    };
  }

  const created = await Model.create({
    lesson_key: lessonKey,
    status: 'queued',
    stage: 'queued',
    priority,
    error: null,
    lock: { owner: null, acquired_at: null, last_stage_at: null },
  });

  return {
    jobId: String(created._id),
    lessonKey,
    stage: 'queued',
    status: 'queued',
    joined: false,
    takeover: false,
  };
}

export async function getJobForLesson(lessonKey: string): Promise<{
  jobId: string | null;
  stage: string | null;
  status: string | null;
  error: string | null;
} | null> {
  if (!mongoConfigured()) return null;
  await connectMongo();
  const job = await PracticeGenerationJobModel()
    .findOne({ lesson_key: lessonKey })
    .sort({ createdAt: -1 })
    .lean();
  if (!job) return null;
  return {
    jobId: String(job._id),
    stage: job.stage ?? null,
    status: job.status ?? null,
    error: job.error ?? null,
  };
}

/** Worker: claim next queued/stale job. */
export async function claimNextJob(): Promise<{
  job: PracticeGenerationJobDoc;
  owner: string;
} | null> {
  await connectMongo();
  const Model = PracticeGenerationJobModel();
  const candidates = await Model.find({
    status: { $in: ['queued', 'running'] },
  })
    .sort({ priority: 1, createdAt: 1 })
    .limit(10);

  for (const job of candidates) {
    if (job.status === 'running' && !isLockStale(job.lock)) continue;
    const owner = newOwner();
    const now = new Date();
    job.status = 'running';
    job.lock = {
      owner,
      acquired_at: now,
      last_stage_at: now,
    };
    if (!job.stage || job.stage === 'queued') job.stage = 'queued';
    await job.save();
    return { job, owner };
  }
  return null;
}

export async function touchJobStage(
  jobId: string,
  owner: string,
  stage: string,
): Promise<void> {
  const job = await PracticeGenerationJobModel().findById(jobId);
  if (!job || job.lock?.owner !== owner) return;
  job.stage = stage;
  job.lock = {
    owner,
    acquired_at: job.lock?.acquired_at ?? new Date(),
    last_stage_at: new Date(),
  };
  await job.save();
}

export async function completeJob(
  jobId: string,
  owner: string,
  result: { ok: boolean; error?: string },
): Promise<void> {
  const job = await PracticeGenerationJobModel().findById(jobId);
  if (!job || job.lock?.owner !== owner) return;
  job.status = result.ok ? 'done' : 'failed';
  job.stage = result.ok ? 'done' : job.stage;
  job.error = result.error ?? null;
  job.lock = {
    owner: null,
    acquired_at: null,
    last_stage_at: new Date(),
  };
  await job.save();
}
