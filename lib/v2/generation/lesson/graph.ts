import mongoose from 'mongoose';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  V2JobModel,
  type V2JobDoc,
  type V2JobKind,
} from '@/lib/v2/mongo/models';
import type { Item } from '@/lib/v2/content/items';
import type { LessonPack } from '@/lib/v2/content/lesson';
import { buildLessonBrief, type LessonBrief } from './brief';
import { inputHash, itemIdTypeTl, type KnownIdTl } from './hash';
import { getDayPlan } from './plan';
import { saveDraft, updateDraft, getLessonVersion } from './save';
import type { OutlineResult, OutlinePagePlan } from './stages/types';
import type { PartialLessonData } from './stages/types';

export function lessonIdFor(day: number, targetLang = 'pt-PT'): string {
  return `${targetLang}.d${String(day).padStart(2, '0')}`;
}

export type JobView = {
  id: string;
  kind: V2JobKind;
  lesson_id: string;
  day: number;
  target_lang: string;
  version: number;
  page_index: number | null;
  page_id: string | null;
  depends_on: string[];
  input_hash: string | null;
  status: string;
  progress: unknown;
  error: string | null;
  provider?: string | null;
  model?: string | null;
  started_at?: Date | string | null;
  finished_at?: Date | string | null;
  input?: unknown;
  output?: unknown;
  handoff?: unknown;
  tokens?: unknown;
  over_budget?: boolean;
  usd_estimate?: number | null;
  issues?: unknown;
  attempts?: unknown[];
};

export function docToJobView(doc: V2JobDoc): JobView {
  return {
    id: String(doc._id),
    kind: doc.kind as V2JobKind,
    lesson_id: doc.lesson_id,
    day: doc.day,
    target_lang: doc.target_lang,
    version: doc.version,
    page_index: doc.page_index ?? null,
    page_id: doc.page_id ?? null,
    depends_on: (doc.depends_on ?? []).map((id) => String(id)),
    input_hash: doc.input_hash ?? null,
    status: doc.status,
    progress: doc.progress ?? null,
    error: doc.error ?? null,
    provider: doc.provider ?? null,
    model: doc.model ?? null,
    started_at: doc.started_at ?? null,
    finished_at: doc.finished_at ?? null,
    input: doc.input ?? null,
    output: doc.output ?? null,
    handoff: doc.handoff ?? null,
    tokens: doc.tokens ?? null,
    over_budget: doc.over_budget ?? false,
    usd_estimate: doc.usd_estimate ?? null,
    issues: doc.issues ?? null,
    attempts: (doc.attempts as unknown[]) ?? [],
  };
}

export function hashItemsJob(
  brief: LessonBrief,
  known: KnownIdTl[],
  planSlice: unknown,
): string {
  return inputHash({ kind: 'items', brief, known, planSlice });
}

export function hashStoryJob(
  brief: LessonBrief,
  items: KnownIdTl[],
  planSlice: unknown,
): string {
  return inputHash({ kind: 'story', brief, items, planSlice });
}

export function hashOutlineJob(
  brief: LessonBrief,
  items: KnownIdTl[],
  pagePlan: unknown,
  storyHandoff?: unknown,
): string {
  return inputHash({ kind: 'outline', brief, items, pagePlan, storyHandoff });
}

export function hashPageJob(
  brief: LessonBrief,
  entry: OutlinePagePlan,
  allowedItems: Item[],
): string {
  return inputHash({ kind: 'page', brief, entry, allowedItems });
}

export function hashQuestionsJob(
  brief: LessonBrief,
  itemRefs: KnownIdTl[],
  outlinePages: unknown,
): string {
  return inputHash({ kind: 'questions', brief, itemRefs, outlinePages });
}

export function hashMicroJob(
  brief: LessonBrief,
  itemRefs: KnownIdTl[],
  microStep: unknown,
): string {
  return inputHash({ kind: 'micro', brief, itemRefs, microStep });
}

export function hashDailyUseJob(
  brief: LessonBrief,
  itemRefs: KnownIdTl[],
  recycle: unknown,
): string {
  return inputHash({ kind: 'daily_use', brief, itemRefs, recycle });
}

export function hashContinuityJob(
  brief: LessonBrief,
  pageSummaries: unknown,
): string {
  return inputHash({ kind: 'continuity', brief, pageSummaries });
}

export function hashAssembleJob(upstreamHashes: string[]): string {
  return inputHash({ kind: 'assemble', upstreamHashes: [...upstreamHashes].sort() });
}

/** Mark done jobs stale when their recomputed hash differs. */
export async function markStaleByHash(
  jobs: V2JobDoc[],
  recompute: (job: V2JobDoc) => string | null,
): Promise<string[]> {
  const staleIds: string[] = [];
  for (const job of jobs) {
    if (job.status !== 'done') continue;
    const next = recompute(job);
    if (next == null) continue;
    if (job.input_hash && job.input_hash !== next) {
      await V2JobModel().updateOne(
        { _id: job._id, status: 'done' },
        { $set: { status: 'stale', input_hash: next } },
      );
      staleIds.push(String(job._id));
    }
  }
  return staleIds;
}

export type EnqueueDagResult = {
  lesson_id: string;
  day: number;
  version: number;
  target_lang: string;
  jobIds: string[];
};

/**
 * Create draft + full job DAG for a day.
 * Page count starts as placeholder (1); after outline, expand page jobs.
 */
export async function enqueueLessonDag(opts: {
  day: number;
  targetLang?: string;
  known: KnownIdTl[];
}): Promise<EnqueueDagResult> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const target_lang = opts.targetLang ?? 'pt-PT';
  const lesson_id = lessonIdFor(opts.day, target_lang);
  const dayPlan = getDayPlan(opts.day);
  const brief = buildLessonBrief(dayPlan);
  const gen = dayPlan.generation ?? {};

  const draft = await saveDraft({
    day: opts.day,
    targetLang: target_lang,
    pack: {
      lesson: {
        id: lesson_id,
        target_lang,
        day: opts.day,
        kind: 'lesson',
        pages: [],
      },
      items: [],
      pages: [],
      questions: [],
    },
    meta: {
      regen_round: 0,
      flagged: false,
      timing: [],
    },
  });

  const version = draft.version;
  const Job = V2JobModel();

  const itemsHash = hashItemsJob(brief, opts.known, {
    core_items: brief.core_items.map((c) => ({
      id: c.id,
      kind: c.kind,
      tl: c.tl,
    })),
    recycle_ids: brief.recycle_ids,
    no_new_items: brief.no_new_items,
    early: dayPlan.early_chunks_tl ?? [],
  });

  const itemsJob = await Job.create({
    kind: 'items',
    lesson_id,
    day: opts.day,
    target_lang,
    version,
    status: 'queued',
    depends_on: [],
    input_hash: itemsHash,
  });

  const storyJob = await Job.create({
    kind: 'story',
    lesson_id,
    day: opts.day,
    target_lang,
    version,
    status: 'queued',
    depends_on: [itemsJob._id],
    input_hash: '', // filled when items done
  });

  const outlineJob = await Job.create({
    kind: 'outline',
    lesson_id,
    day: opts.day,
    target_lang,
    version,
    status: 'queued',
    depends_on: [storyJob._id],
    input_hash: '', // filled when story done
  });

  // Fan-out shells — page + per-page questions created after outline.
  const microJob = await Job.create({
    kind: 'micro',
    lesson_id,
    day: opts.day,
    target_lang,
    version,
    status: 'queued',
    depends_on: [outlineJob._id],
    input_hash: '',
  });

  const dailyJob = await Job.create({
    kind: 'daily_use',
    lesson_id,
    day: opts.day,
    target_lang,
    version,
    status: 'queued',
    depends_on: [outlineJob._id],
    input_hash: '',
  });

  // Continuity + assemble deps filled in expandPageJobs once questions:pN exist
  const continuityJob = await Job.create({
    kind: 'continuity',
    lesson_id,
    day: opts.day,
    target_lang,
    version,
    status: 'queued',
    depends_on: [outlineJob._id, microJob._id, dailyJob._id],
    input_hash: '',
  });

  const assembleJob = await Job.create({
    kind: 'assemble',
    lesson_id,
    day: opts.day,
    target_lang,
    version,
    status: 'queued',
    depends_on: [continuityJob._id, microJob._id, dailyJob._id],
    input_hash: '',
  });

  const langCheckJob = await Job.create({
    kind: 'lang_check',
    lesson_id,
    day: opts.day,
    target_lang,
    version,
    status: 'queued',
    depends_on: [assembleJob._id],
    input_hash: '',
  });

  await updateDraft({
    day: opts.day,
    targetLang: target_lang,
    version,
    meta: {
      job_graph: true,
      regen_round: 0,
    },
    mergeMeta: true,
  });

  return {
    lesson_id,
    day: opts.day,
    version,
    target_lang,
    jobIds: [
      String(itemsJob._id),
      String(storyJob._id),
      String(outlineJob._id),
      String(microJob._id),
      String(dailyJob._id),
      String(continuityJob._id),
      String(assembleJob._id),
      String(langCheckJob._id),
    ],
  };
}

/** After outline finishes, create page jobs and wire continuity/assemble deps. */
export async function expandPageJobs(opts: {
  day: number;
  targetLang: string;
  version: number;
  outline: OutlineResult;
  items: Item[];
}): Promise<void> {
  await connectMongo();
  const lesson_id = lessonIdFor(opts.day, opts.targetLang);
  const Job = V2JobModel();
  const brief = buildLessonBrief(getDayPlan(opts.day));

  const outlineJob = await Job.findOne({
    lesson_id,
    version: opts.version,
    kind: 'outline',
  });
  const microJob = await Job.findOne({
    lesson_id,
    version: opts.version,
    kind: 'micro',
  });
  const dailyJob = await Job.findOne({
    lesson_id,
    version: opts.version,
    kind: 'daily_use',
  });
  const continuityJob = await Job.findOne({
    lesson_id,
    version: opts.version,
    kind: 'continuity',
  });
  const assembleJob = await Job.findOne({
    lesson_id,
    version: opts.version,
    kind: 'assemble',
  });

  if (!outlineJob || !continuityJob || !assembleJob) return;

  // Remove any existing page/critic/questions jobs for this version
  await Job.deleteMany({
    lesson_id,
    version: opts.version,
    kind: { $in: ['page', 'critic', 'questions'] },
  });

  const pageIds: mongoose.Types.ObjectId[] = [];
  const criticIds: mongoose.Types.ObjectId[] = [];
  const questionsIds: mongoose.Types.ObjectId[] = [];
  for (const entry of opts.outline.pages) {
    // Story pointers (intro + test) are owned by story/assemble — no LLM page/critic/questions.
    const isStoryPointer =
      entry.role === 'intro' ||
      entry.role === 'test' ||
      (entry.index === 0 && entry.preset === 'story');
    if (isStoryPointer) continue;

    const allowedIds = new Set([...entry.introduces, ...entry.assumes]);
    const allowed = opts.items.filter((i) => allowedIds.has(i.id));
    const hash = hashPageJob(brief, entry, allowed);
    const pageJob = await Job.create({
      kind: 'page',
      lesson_id,
      day: opts.day,
      target_lang: opts.targetLang,
      version: opts.version,
      page_index: entry.index,
      page_id: entry.page_id,
      status: 'queued',
      depends_on: [outlineJob._id],
      input_hash: hash,
    });
    pageIds.push(pageJob._id as mongoose.Types.ObjectId);

    const criticJob = await Job.create({
      kind: 'critic',
      lesson_id,
      day: opts.day,
      target_lang: opts.targetLang,
      version: opts.version,
      page_index: entry.index,
      page_id: entry.page_id,
      status: 'queued',
      depends_on: [pageJob._id],
      input_hash: inputHash({ kind: 'critic', brief, entry, pageHash: hash }),
    });
    criticIds.push(criticJob._id as mongoose.Types.ObjectId);

    const qJob = await Job.create({
      kind: 'questions',
      lesson_id,
      day: opts.day,
      target_lang: opts.targetLang,
      version: opts.version,
      page_index: entry.index,
      page_id: entry.page_id,
      status: 'queued',
      depends_on: [outlineJob._id],
      input_hash: hashQuestionsJob(brief, itemsAsKnown(opts.items), [entry]),
    });
    questionsIds.push(qJob._id as mongoose.Types.ObjectId);
  }

  const contDeps = [
    ...criticIds,
    ...questionsIds,
    microJob?._id,
    dailyJob?._id,
  ].filter(Boolean) as mongoose.Types.ObjectId[];

  await Job.updateOne(
    { _id: continuityJob._id },
    { $set: { depends_on: contDeps } },
  );

  const assembleDeps = [
    continuityJob._id,
    ...pageIds,
    ...questionsIds,
    microJob?._id,
    dailyJob?._id,
  ].filter(Boolean) as mongoose.Types.ObjectId[];

  await Job.updateOne(
    { _id: assembleJob._id },
    { $set: { depends_on: assembleDeps } },
  );
}

export async function listJobsForVersion(
  day: number,
  version: number,
  targetLang = 'pt-PT',
): Promise<JobView[]> {
  if (!mongoConfigured()) return [];
  await connectMongo();
  const docs = await V2JobModel()
    .find({ day, target_lang: targetLang, version })
    .sort({ kind: 1, page_index: 1 });
  return docs.map(docToJobView);
}

const CLAIM_WINDOW = 300;

async function tryClaimJob(
  jobId: mongoose.Types.ObjectId | string,
  workerId: string,
  lease: Date,
): Promise<JobView | null> {
  const updated = await V2JobModel().findOneAndUpdate(
    { _id: jobId, status: 'queued' },
    {
      $set: {
        status: 'running',
        worker_id: workerId,
        lease_expires_at: lease,
      },
    },
    { returnDocument: 'after' },
  );
  return updated ? docToJobView(updated as V2JobDoc) : null;
}

async function depsReady(
  deps: mongoose.Types.ObjectId[] | string[],
): Promise<boolean> {
  if (!deps.length) return true;
  const depDocs = await V2JobModel().find({ _id: { $in: deps } });
  return depDocs.length === deps.length && depDocs.every((d) => d.status === 'done');
}

/**
 * Claim up to `limit` ready queued jobs.
 * Prefer zero-dep roots first so new day `items` jobs are not starved behind
 * a long FIFO window of blocked page/outline jobs from older versions.
 */
export async function claimReadyJobs(
  workerId: string,
  limit: number,
  filter?: { day?: number; version?: number; targetLang?: string },
): Promise<JobView[]> {
  await connectMongo();
  const lease = new Date(Date.now() + 10 * 60 * 1000);
  const claimed: JobView[] = [];
  const claimedIds = new Set<string>();
  let skippedDeps = 0;
  let scanned = 0;

  const scope: Record<string, unknown> = {};
  if (filter?.day != null) scope.day = filter.day;
  if (filter?.version != null) scope.version = filter.version;
  if (filter?.targetLang) scope.target_lang = filter.targetLang;

  // Reclaim expired
  await V2JobModel().updateMany(
    { status: 'running', lease_expires_at: { $lt: new Date() }, ...scope },
    { $set: { status: 'queued' }, $unset: { worker_id: 1, lease_expires_at: 1 } },
  );

  // 1) Zero-dep roots (items, and any other job with empty depends_on)
  const roots = await V2JobModel()
    .find({
      status: 'queued',
      kind: { $exists: true },
      ...scope,
      $or: [
        { depends_on: { $exists: false } },
        { depends_on: { $size: 0 } },
        { depends_on: [] },
      ],
    })
    .sort({ createdAt: 1 })
    .limit(limit);

  for (const job of roots) {
    if (claimed.length >= limit) break;
    scanned += 1;
    const view = await tryClaimJob(job._id, workerId, lease);
    if (view) {
      claimed.push(view);
      claimedIds.add(view.id);
    }
  }

  // 2) Fill remaining from oldest queued window (deps must be done)
  if (claimed.length < limit) {
    const queued = await V2JobModel()
      .find({ status: 'queued', kind: { $exists: true }, ...scope })
      .sort({ createdAt: 1 })
      .limit(CLAIM_WINDOW);

    for (const job of queued) {
      if (claimed.length >= limit) break;
      const id = String(job._id);
      if (claimedIds.has(id)) continue;
      scanned += 1;
      const deps = job.depends_on ?? [];
      if (!(await depsReady(deps))) {
        skippedDeps += 1;
        continue;
      }
      const view = await tryClaimJob(job._id, workerId, lease);
      if (view) {
        claimed.push(view);
        claimedIds.add(view.id);
      }
    }
  }

  if (claimed.length === 0 && scanned > 0) {
    console.info(
      `[v2-gen:claim] claimed=0 skipped_deps=${skippedDeps} scanned=${scanned} window=${CLAIM_WINDOW}`,
    );
  } else if (claimed.length > 0) {
    console.info(
      `[v2-gen:claim] claimed=${claimed.length} kinds=${claimed.map((j) => j.kind).join(',')} skipped_deps=${skippedDeps} scanned=${scanned}`,
    );
  }

  return claimed;
}

export async function requeueJob(jobId: string): Promise<JobView | null> {
  await connectMongo();
  const doc = await V2JobModel().findOneAndUpdate(
    { _id: jobId },
    {
      $set: { status: 'queued' },
      $unset: { error: 1, worker_id: 1, lease_expires_at: 1 },
    },
    { returnDocument: 'after' },
  );
  return doc ? docToJobView(doc) : null;
}

export async function requeueStale(
  day: number,
  version: number,
  targetLang = 'pt-PT',
): Promise<number> {
  await connectMongo();
  const res = await V2JobModel().updateMany(
    { day, target_lang: targetLang, version, status: 'stale' },
    {
      $set: { status: 'queued' },
      $unset: { error: 1, worker_id: 1, lease_expires_at: 1 },
    },
  );
  return res.modifiedCount ?? 0;
}

export async function loadDraftData(
  day: number,
  version: number,
  targetLang = 'pt-PT',
): Promise<PartialLessonData & { meta?: Record<string, unknown> }> {
  const lesson = await getLessonVersion(day, version, targetLang);
  if (!lesson) throw new Error(`No draft day=${day} v${version}`);
  return {
    ...(lesson.data as PartialLessonData),
    meta: lesson.meta as Record<string, unknown>,
  };
}

export function itemsAsKnown(items: Item[]): KnownIdTl[] {
  return items
    .map((i) => itemIdTypeTl(i))
    .filter((x): x is KnownIdTl => !!x);
}

/**
 * After a hand-edit of draft items, recompute hashes and mark done jobs stale
 * when their hash inputs changed.
 */
export async function rehashAfterItemEdit(opts: {
  day: number;
  version: number;
  targetLang?: string;
  items: Item[];
}): Promise<string[]> {
  await connectMongo();
  const target_lang = opts.targetLang ?? 'pt-PT';
  const brief = buildLessonBrief(getDayPlan(opts.day));
  const dayPlan = getDayPlan(opts.day);
  const known = itemsAsKnown(opts.items);
  const lesson = await getLessonVersion(opts.day, opts.version, target_lang);
  if (!lesson) throw new Error('No lesson version');
  const data = lesson.data as PartialLessonData & {
    outline?: OutlineResult;
    pages?: unknown[];
  };
  const outline =
    data.outline ??
    (lesson.meta?.outline as OutlineResult | undefined) ??
    undefined;
  const jobs = await V2JobModel().find({
    day: opts.day,
    target_lang,
    version: opts.version,
  });

  return markStaleByHash(jobs, (job) => {
    switch (job.kind) {
      case 'story':
        return hashStoryJob(brief, known, {
          core_items: brief.core_items,
          recycle_ids: brief.recycle_ids,
        });
      case 'outline':
        return hashOutlineJob(
          brief,
          known,
          dayPlan.generation?.page_plan ?? [],
          (lesson.meta as { handoffs?: { story?: unknown } } | undefined)
            ?.handoffs?.story,
        );
      case 'page': {
        if (!outline) return null;
        const entry = outline.pages.find((p) => p.index === job.page_index);
        if (!entry) return null;
        const allowedIds = new Set([...entry.introduces, ...entry.assumes]);
        const allowed = opts.items.filter((i) => allowedIds.has(i.id));
        return hashPageJob(brief, entry, allowed);
      }
      case 'questions':
        return hashQuestionsJob(brief, known, outline?.pages ?? []);
      case 'micro':
        return hashMicroJob(brief, known, dayPlan.generation?.micro_step);
      case 'daily_use':
        return hashDailyUseJob(brief, known, brief.recycle_ids);
      case 'continuity': {
        const pages = (data.pages as { id?: string; preset?: string }[]) ?? [];
        return hashContinuityJob(
          brief,
          pages
            .filter(Boolean)
            .map((p) => ({ id: p?.id, preset: p?.preset })),
        );
      }
      case 'assemble': {
        const upstream = jobs
          .filter((j) => j.kind !== 'assemble' && j.input_hash)
          .map((j) => j.input_hash!);
        return hashAssembleJob(upstream);
      }
      case 'items':
        return null; // hand-edit does not stale the items job itself
      default:
        return null;
    }
  });
}

export type { LessonPack };
