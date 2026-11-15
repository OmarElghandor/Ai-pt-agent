import mongoose from 'mongoose';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2LibraryJobModel } from '@/lib/v2/mongo/libraryModels';
import { LIBRARY_LANG } from './types';

/**
 * Library background jobs (14d §2.6). One running or queued job per episode
 * per stage family; a second request is refused (conflict), never queued.
 *
 * Storage sits behind `JobStore` so the runner and its tests need no database.
 */

export const LIBRARY_JOB_KINDS = [
  'library_script',
  'library_line_rewrite',
  'library_tokens',
  'library_audio_line',
  'library_stitch',
  'library_image',
  'library_voice_test',
] as const;
export type LibraryJobKind = (typeof LIBRARY_JOB_KINDS)[number];

export type JobFamily = 'script' | 'tokens' | 'audio' | 'images' | 'voices';

export function jobFamily(kind: LibraryJobKind): JobFamily {
  switch (kind) {
    case 'library_script':
    case 'library_line_rewrite':
      return 'script';
    case 'library_tokens':
      return 'tokens';
    case 'library_audio_line':
    case 'library_stitch':
      return 'audio';
    case 'library_image':
      return 'images';
    case 'library_voice_test':
      return 'voices';
  }
}

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

export type JobCost = {
  model?: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  usd: number;
};

export type JobRecord = {
  id: string;
  kind: LibraryJobKind;
  target_lang: string;
  episode_slug: string;
  family: JobFamily;
  line_index?: number | null;
  params?: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  cost?: JobCost | null;
  error?: string | null;
  result?: Record<string, unknown> | null;
  started_at?: Date | string | null;
  finished_at?: Date | string | null;
  created_at: Date | string;
};

export type JobCreate = {
  kind: LibraryJobKind;
  target_lang: string;
  episode_slug: string;
  family: JobFamily;
  line_index?: number | null;
  params?: Record<string, unknown>;
  created_at: Date;
};

export type JobPatch = Partial<
  Pick<
    JobRecord,
    'status' | 'attempts' | 'cost' | 'error' | 'result' | 'started_at' | 'finished_at'
  >
>;

/** Thrown by `JobStore.create` when an active job already exists for the key. */
export class JobConflictError extends Error {
  constructor() {
    super('another job is active for this episode and stage');
  }
}

export interface JobStore {
  /** Active (queued or running) job for the episode + family, if any. */
  findActive(lang: string, slug: string, family: JobFamily): Promise<JobRecord | null>;
  /** Create a queued job. Throws JobConflictError if an active one exists. */
  create(input: JobCreate): Promise<JobRecord>;
  update(id: string, patch: JobPatch): Promise<void>;
  get(id: string): Promise<JobRecord | null>;
  /** Most recent job of the family (any status). */
  latest(lang: string, slug: string, family: JobFamily): Promise<JobRecord | null>;
}

/** A queued/running job older than this is treated as dead (process crashed). */
export const JOB_STALE_MS = 15 * 60 * 1000;

export type EnqueueResult =
  | { ok: true; job: JobRecord }
  | { ok: false; conflict: true; job: JobRecord };

export type EnqueueOptions = {
  lang?: string;
  line_index?: number | null;
  params?: Record<string, unknown>;
  now?: Date;
};

function ageMs(job: JobRecord, now: Date): number {
  const t = new Date(job.started_at ?? job.created_at).getTime();
  return now.getTime() - t;
}

/**
 * Enqueue a job. Refused with `conflict` when another job of the same
 * episode + stage family is queued or running (unless that one is stale).
 */
export async function enqueueJob(
  kind: LibraryJobKind,
  slug: string,
  opts: EnqueueOptions = {},
  store: JobStore = mongoJobStore(),
): Promise<EnqueueResult> {
  const lang = opts.lang ?? LIBRARY_LANG;
  const now = opts.now ?? new Date();
  const family = jobFamily(kind);

  const active = await store.findActive(lang, slug, family);
  if (active) {
    if (ageMs(active, now) <= JOB_STALE_MS) {
      return { ok: false, conflict: true, job: active };
    }
    await store.update(active.id, {
      status: 'failed',
      error: 'timed out (no heartbeat)',
      finished_at: now,
    });
  }
  try {
    const job = await store.create({
      kind,
      target_lang: lang,
      episode_slug: slug,
      family,
      line_index: opts.line_index ?? null,
      params: opts.params,
      created_at: now,
    });
    return { ok: true, job };
  } catch (e) {
    if (e instanceof JobConflictError) {
      const other = await store.findActive(lang, slug, family);
      if (other) return { ok: false, conflict: true, job: other };
    }
    throw e;
  }
}

export async function markJobRunning(
  store: JobStore,
  id: string,
  now: Date = new Date(),
): Promise<void> {
  await store.update(id, { status: 'running', started_at: now });
}

export async function finishJob(
  store: JobStore,
  id: string,
  patch: JobPatch & { status: 'done' | 'failed' },
  now: Date = new Date(),
): Promise<void> {
  await store.update(id, { ...patch, finished_at: now });
}

/* ------------------------------------------------------------------ */
/* In-memory store (tests, local tooling)                              */
/* ------------------------------------------------------------------ */

export function memoryJobStore(): JobStore & { jobs: JobRecord[] } {
  const jobs: JobRecord[] = [];
  let seq = 0;
  const isActive = (j: JobRecord) => j.status === 'queued' || j.status === 'running';
  return {
    jobs,
    async findActive(lang, slug, family) {
      return (
        jobs.find(
          (j) =>
            j.target_lang === lang &&
            j.episode_slug === slug &&
            j.family === family &&
            isActive(j),
        ) ?? null
      );
    },
    async create(input) {
      const dup = jobs.find(
        (j) =>
          j.target_lang === input.target_lang &&
          j.episode_slug === input.episode_slug &&
          j.family === input.family &&
          isActive(j),
      );
      if (dup) throw new JobConflictError();
      seq += 1;
      const job: JobRecord = {
        id: `job${seq}`,
        kind: input.kind,
        target_lang: input.target_lang,
        episode_slug: input.episode_slug,
        family: input.family,
        line_index: input.line_index ?? null,
        params: input.params,
        status: 'queued',
        attempts: 0,
        created_at: input.created_at,
      };
      jobs.push(job);
      return job;
    },
    async update(id, patch) {
      const j = jobs.find((x) => x.id === id);
      if (j) Object.assign(j, patch);
    },
    async get(id) {
      return jobs.find((j) => j.id === id) ?? null;
    },
    async latest(lang, slug, family) {
      const list = jobs.filter(
        (j) => j.target_lang === lang && j.episode_slug === slug && j.family === family,
      );
      return list[list.length - 1] ?? null;
    },
  };
}

/* ------------------------------------------------------------------ */
/* MongoDB store                                                       */
/* ------------------------------------------------------------------ */

type JobLean = {
  _id: mongoose.Types.ObjectId;
  kind: LibraryJobKind;
  target_lang: string;
  episode_slug: string;
  family?: JobFamily | null;
  line_index?: number | null;
  params?: Record<string, unknown> | null;
  status: JobStatus;
  attempts: number;
  cost?: JobCost | null;
  error?: string | null;
  result?: Record<string, unknown> | null;
  started_at?: Date | null;
  finished_at?: Date | null;
  createdAt?: Date;
};

function toRecord(d: JobLean): JobRecord {
  return {
    id: String(d._id),
    kind: d.kind,
    target_lang: d.target_lang,
    episode_slug: d.episode_slug,
    family: d.family ?? jobFamily(d.kind),
    line_index: d.line_index ?? null,
    params: d.params ?? undefined,
    status: d.status,
    attempts: d.attempts ?? 0,
    cost: d.cost ?? null,
    error: d.error ?? null,
    result: d.result ?? null,
    started_at: d.started_at ?? null,
    finished_at: d.finished_at ?? null,
    created_at: d.createdAt ?? new Date(0),
  };
}

export function mongoJobStore(): JobStore {
  async function ready() {
    if (!mongoConfigured()) throw new Error('MongoDB not configured');
    await connectMongo();
  }
  return {
    async findActive(lang, slug, family) {
      await ready();
      const d = await V2LibraryJobModel()
        .findOne({ target_lang: lang, episode_slug: slug, family, active: true })
        .lean();
      return d ? toRecord(d as unknown as JobLean) : null;
    },
    async create(input) {
      await ready();
      try {
        const d = await V2LibraryJobModel().create({
          kind: input.kind,
          target_lang: input.target_lang,
          episode_slug: input.episode_slug,
          family: input.family,
          line_index: input.line_index ?? undefined,
          params: input.params,
          status: 'queued',
          attempts: 0,
          active: true,
        });
        return toRecord(d.toObject() as unknown as JobLean);
      } catch (e) {
        if ((e as { code?: number }).code === 11000) throw new JobConflictError();
        throw e;
      }
    },
    async update(id, patch) {
      await ready();
      const finished = patch.status === 'done' || patch.status === 'failed';
      await V2LibraryJobModel().updateOne(
        { _id: id },
        { $set: { ...patch, ...(finished ? { active: false } : {}) } },
      );
    },
    async get(id) {
      await ready();
      if (!mongoose.isValidObjectId(id)) return null;
      const d = await V2LibraryJobModel().findById(id).lean();
      return d ? toRecord(d as unknown as JobLean) : null;
    },
    async latest(lang, slug, family) {
      await ready();
      const d = await V2LibraryJobModel()
        .findOne({ target_lang: lang, episode_slug: slug, family })
        .sort({ createdAt: -1 })
        .lean();
      return d ? toRecord(d as unknown as JobLean) : null;
    },
  };
}

/** JSON-safe job view for the poll API. */
export function jobView(j: JobRecord) {
  return {
    id: j.id,
    kind: j.kind,
    family: j.family,
    episode_slug: j.episode_slug,
    line_index: j.line_index ?? null,
    params: j.params ?? null,
    status: j.status,
    attempts: j.attempts,
    cost: j.cost ?? null,
    error: j.error ?? null,
    result: j.result ?? null,
    started_at: j.started_at ?? null,
    finished_at: j.finished_at ?? null,
    created_at: j.created_at,
  };
}
