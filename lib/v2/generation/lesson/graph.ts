import mongoose from 'mongoose';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  V2JobModel,
  V2StoryModel,
  type V2JobDoc,
  type V2JobKind,
} from '@/lib/v2/mongo/models';
import type { Item } from '@/lib/v2/content/items';
import type { LessonPack } from '@/lib/v2/content/lesson';
import { modeForPreset, type Page } from '@/lib/v2/content/page';
import { buildLessonBrief, type LessonBrief } from './brief';
import { inputHash, itemIdTypeTl, type KnownIdTl } from './hash';
import type { StoryHandoff } from './handoffs';
import { getDayPlan } from './plan';
import {
  getLessonVersion,
  resetDraftForRegen,
  setDraftHandoff,
  updateDraft,
} from './save';
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
  rwPhraseIds?: string[],
): string {
  return inputHash({
    kind: 'questions',
    brief,
    itemRefs,
    outlinePages,
    rwPhraseIds: rwPhraseIds ?? [],
  });
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

export function hashRealWorldJob(
  brief: LessonBrief,
  itemRefs: KnownIdTl[],
  authored: unknown,
): string {
  return inputHash({ kind: 'real_world', brief, itemRefs, authored });
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
 * Reuses the existing day×lang version in place (no bump).
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

  const draft = await resetDraftForRegen({
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
      job_graph: true,
      text_ready: false,
    },
  });

  const version = draft.version;
  const Job = V2JobModel();

  // Wipe prior DAGs / stories so regenerate cannot race old version jobs.
  await Job.deleteMany({ day: opts.day, target_lang });
  await V2StoryModel().deleteMany({ day: opts.day, target_lang });

  const { markPacksStaleForLesson } = await import(
    '@/lib/v2/generation/pack/save'
  );
  await markPacksStaleForLesson({
    day: opts.day,
    targetLang: target_lang,
    lessonVersion: version,
    force: true,
    reason: `lesson regenerated at v${version}`,
  });

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

  // Soft add-on: after items, parallel with pages (00 §4 / 07).
  const realWorldJob = await Job.create({
    kind: 'real_world',
    lesson_id,
    day: opts.day,
    target_lang,
    version,
    status: 'queued',
    depends_on: [itemsJob._id],
    input_hash: '',
  });

  // Day-level questions job — soft-depends on real_world (00 §7 2026-11-03).
  const questionsJob = await Job.create({
    kind: 'questions',
    lesson_id,
    day: opts.day,
    target_lang,
    version,
    status: 'queued',
    depends_on: [outlineJob._id, realWorldJob._id],
    input_hash: '',
  });

  // Continuity + assemble deps filled in expandPageJobs once page critics exist
  const continuityJob = await Job.create({
    kind: 'continuity',
    lesson_id,
    day: opts.day,
    target_lang,
    version,
    status: 'queued',
    depends_on: [
      outlineJob._id,
      microJob._id,
      dailyJob._id,
      questionsJob._id,
      realWorldJob._id,
    ],
    input_hash: '',
  });

  const assembleJob = await Job.create({
    kind: 'assemble',
    lesson_id,
    day: opts.day,
    target_lang,
    version,
    status: 'queued',
    depends_on: [
      continuityJob._id,
      microJob._id,
      dailyJob._id,
      questionsJob._id,
      realWorldJob._id,
    ],
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
      String(questionsJob._id),
      String(microJob._id),
      String(dailyJob._id),
      String(realWorldJob._id),
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
  const realWorldJob = await Job.findOne({
    lesson_id,
    version: opts.version,
    kind: 'real_world',
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

  // Remove any existing page/critic jobs for this version (keep day-level questions).
  await Job.deleteMany({
    lesson_id,
    version: opts.version,
    kind: { $in: ['page', 'critic'] },
  });

  // Drop legacy per-page questions jobs if any remain from older graphs.
  await Job.deleteMany({
    lesson_id,
    version: opts.version,
    kind: 'questions',
    page_index: { $ne: null },
  });

  const pageIds: mongoose.Types.ObjectId[] = [];
  const criticIds: mongoose.Types.ObjectId[] = [];
  for (const entry of opts.outline.pages) {
    // Story pointers (intro + test) are owned by story/assemble — no LLM page/critic.
    // real_world is code-built from its own soft job — no LLM page/critic.
    const isStoryPointer =
      entry.role === 'intro' ||
      entry.role === 'test' ||
      (entry.index === 0 && entry.preset === 'story');
    if (isStoryPointer || entry.preset === 'real_world') continue;

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
  }

  let questionsJob = await Job.findOne({
    lesson_id,
    version: opts.version,
    kind: 'questions',
    $or: [{ page_index: null }, { page_index: { $exists: false } }],
  });
  const qDeps = [outlineJob._id, realWorldJob?._id].filter(
    Boolean,
  ) as mongoose.Types.ObjectId[];
  const rwIdsForHash = opts.items
    .filter(
      (i) =>
        i.id.startsWith('phrase.rw.') ||
        (i as { real_world?: boolean }).real_world,
    )
    .map((i) => i.id);
  if (!questionsJob) {
    questionsJob = await Job.create({
      kind: 'questions',
      lesson_id,
      day: opts.day,
      target_lang: opts.targetLang,
      version: opts.version,
      status: 'queued',
      depends_on: qDeps,
      input_hash: hashQuestionsJob(
        brief,
        itemsAsKnown(opts.items),
        opts.outline.pages,
        rwIdsForHash,
      ),
    });
  } else {
    await Job.updateOne(
      { _id: questionsJob._id },
      {
        $set: {
          input_hash: hashQuestionsJob(
            brief,
            itemsAsKnown(opts.items),
            opts.outline.pages,
            rwIdsForHash,
          ),
          depends_on: qDeps,
        },
      },
    );
  }

  const contDeps = [
    ...criticIds,
    questionsJob._id,
    microJob?._id,
    dailyJob?._id,
    realWorldJob?._id,
  ].filter(Boolean) as mongoose.Types.ObjectId[];

  await Job.updateOne(
    { _id: continuityJob._id },
    { $set: { depends_on: contDeps } },
  );

  const assembleDeps = [
    continuityJob._id,
    ...pageIds,
    questionsJob._id,
    microJob?._id,
    dailyJob?._id,
    realWorldJob?._id,
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

/** Hard deps need `done`. Soft jobs (story) may finish as `skipped` and still unblock. */
async function depsReady(
  deps: mongoose.Types.ObjectId[] | string[],
): Promise<boolean> {
  if (!deps.length) return true;
  const depDocs = await V2JobModel().find({ _id: { $in: deps } });
  return (
    depDocs.length === deps.length &&
    depDocs.every((d) => d.status === 'done' || d.status === 'skipped')
  );
}

/**
 * Claim up to `limit` ready queued jobs.
 * Prefer zero-dep roots first so new day `items` jobs are not starved behind
 * a long FIFO window of blocked page/outline jobs from older versions.
 */
export type ClaimJobsFilter = {
  day?: number;
  version?: number;
  targetLang?: string;
  kinds?: V2JobKind[];
};

export async function claimReadyJobs(
  workerId: string,
  limit: number,
  filter?: ClaimJobsFilter,
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
  if (filter?.kinds?.length) scope.kind = { $in: filter.kinds };

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

/**
 * Requeue (or create) the day-level questions job for the latest lesson version,
 * then requeue assemble + lang_check so page.check / practice stay in sync.
 */
export async function enqueueQuestionsRegen(opts: {
  day: number;
  targetLang?: string;
}): Promise<{
  day: number;
  version: number;
  target_lang: string;
  questionsJobId: string;
  requeued: string[];
}> {
  if (!mongoConfigured()) {
    throw new Error('MongoDB not configured');
  }
  await connectMongo();
  const target_lang = opts.targetLang ?? 'pt-PT';
  const day = opts.day;

  const latest = await V2JobModel()
    .find({ day, target_lang, kind: { $exists: true } })
    .sort({ version: -1 })
    .limit(1);
  if (!latest[0]) {
    throw new Error(`No jobs for day ${day} — generate the lesson first`);
  }
  const version = latest[0].version as number;
  const lesson_id = lessonIdFor(day, target_lang);

  const draft = await getLessonVersion(day, version, target_lang);
  if (!draft) {
    throw new Error(`No lesson draft day=${day} v${version}`);
  }
  const data = draft.data as PartialLessonData & { outline?: OutlineResult };
  const items = (data.items ?? []) as Item[];
  const outline =
    (data.outline as OutlineResult | undefined) ??
    (draft.meta?.outline as OutlineResult | undefined);
  if (!outline?.pages?.length) {
    throw new Error('outline/items required — finish outline before regenerating questions');
  }
  if (!items.length) {
    throw new Error('outline/items required — item bank is empty');
  }
  // Ensure outline is on data for the questions worker
  if (!(data.outline as OutlineResult | undefined)?.pages?.length) {
    await updateDraft({
      day,
      targetLang: target_lang,
      version,
      pack: { ...data, outline },
    });
  }

  const Job = V2JobModel();
  const outlineJob = await Job.findOne({
    lesson_id,
    version,
    kind: 'outline',
  });
  if (!outlineJob) {
    throw new Error('outline job missing for this version');
  }

  const brief = buildLessonBrief(getDayPlan(day));
  const realWorldJob = await Job.findOne({
    lesson_id,
    version,
    kind: 'real_world',
  });
  const qDeps = [outlineJob._id, realWorldJob?._id].filter(
    Boolean,
  ) as mongoose.Types.ObjectId[];
  const rwIdsForHash = items
    .filter(
      (i) =>
        i.id.startsWith('phrase.rw.') ||
        (i as { real_world?: boolean }).real_world,
    )
    .map((i) => i.id);
  let questionsJob = await Job.findOne({
    lesson_id,
    version,
    kind: 'questions',
    $or: [{ page_index: null }, { page_index: { $exists: false } }],
  });

  if (!questionsJob) {
    questionsJob = await Job.create({
      kind: 'questions',
      lesson_id,
      day,
      target_lang,
      version,
      status: 'queued',
      depends_on: qDeps,
      input_hash: hashQuestionsJob(
        brief,
        itemsAsKnown(items),
        outline.pages,
        rwIdsForHash,
      ),
    });
  } else {
    await Job.updateOne(
      { _id: questionsJob._id },
      {
        $set: {
          status: 'queued',
          depends_on: qDeps,
          input_hash: hashQuestionsJob(
            brief,
            itemsAsKnown(items),
            outline.pages,
            rwIdsForHash,
          ),
        },
        $unset: { error: 1, worker_id: 1, lease_expires_at: 1 },
      },
    );
  }

  const requeued: string[] = ['questions'];
  const questionsJobId = String(questionsJob._id);
  const qOid = questionsJob._id as mongoose.Types.ObjectId;

  const assembleJob = await Job.findOne({ lesson_id, version, kind: 'assemble' });
  if (assembleJob) {
    const deps = (assembleJob.depends_on ?? []).map(String);
    if (!deps.includes(questionsJobId)) {
      await Job.updateOne(
        { _id: assembleJob._id },
        {
          $set: {
            status: 'queued',
            depends_on: [...(assembleJob.depends_on ?? []), qOid],
          },
          $unset: { error: 1, worker_id: 1, lease_expires_at: 1 },
        },
      );
    } else {
      await requeueJob(String(assembleJob._id));
    }
    requeued.push('assemble');
  }

  const langCheckJob = await Job.findOne({
    lesson_id,
    version,
    kind: 'lang_check',
  });
  if (langCheckJob) {
    await requeueJob(String(langCheckJob._id));
    requeued.push('lang_check');
  }

  return {
    day,
    version,
    target_lang,
    questionsJobId,
    requeued,
  };
}

/**
 * Requeue only the story job for the latest version.
 * Never requeues outline / pages / questions / assemble.
 * After success, processLessonJob calls linkStoryIntoLesson when outline is already done.
 */
export async function enqueueStoryRegen(opts: {
  day: number;
  targetLang?: string;
}): Promise<{
  day: number;
  version: number;
  target_lang: string;
  storyJobId: string;
}> {
  if (!mongoConfigured()) {
    throw new Error('MongoDB not configured');
  }
  await connectMongo();
  const target_lang = opts.targetLang ?? 'pt-PT';
  const day = opts.day;

  const latest = await V2JobModel()
    .find({ day, target_lang, kind: { $exists: true } })
    .sort({ version: -1 })
    .limit(1);
  if (!latest[0]) {
    throw new Error(`No jobs for day ${day} — generate the lesson first`);
  }
  const version = latest[0].version as number;
  const lesson_id = lessonIdFor(day, target_lang);

  const Job = V2JobModel();
  const itemsJob = await Job.findOne({ lesson_id, version, kind: 'items' });
  if (!itemsJob || itemsJob.status !== 'done') {
    throw new Error('items job must be done before regenerating story');
  }

  const draft = await getLessonVersion(day, version, target_lang);
  if (!draft) {
    throw new Error(`No lesson draft day=${day} v${version}`);
  }
  const data = draft.data as PartialLessonData;
  const items = (data.items ?? []) as Item[];
  if (!items.length) {
    throw new Error('item bank is empty — finish items before regenerating story');
  }

  const brief = buildLessonBrief(getDayPlan(day));
  let storyJob = await Job.findOne({ lesson_id, version, kind: 'story' });
  const storyHash = hashStoryJob(brief, itemsAsKnown(items), {
    chat_character: getDayPlan(day).generation?.chat_character,
    grammar_focus: getDayPlan(day).generation?.grammar_focus,
    is_story: getDayPlan(day).is_story,
  });

  if (!storyJob) {
    storyJob = await Job.create({
      kind: 'story',
      lesson_id,
      day,
      target_lang,
      version,
      status: 'queued',
      depends_on: [itemsJob._id],
      input_hash: storyHash,
    });
  } else {
    await Job.updateOne(
      { _id: storyJob._id },
      {
        $set: {
          status: 'queued',
          depends_on: [itemsJob._id],
          input_hash: storyHash,
        },
        $unset: { error: 1, worker_id: 1, lease_expires_at: 1, handoff: 1 },
      },
    );
  }

  return {
    day,
    version,
    target_lang,
    storyJobId: String(storyJob._id),
  };
}

/**
 * After a late story success (admin regen), attach story_id + page 0 without
 * re-running outline/pages/questions.
 */
export async function linkStoryIntoLesson(opts: {
  day: number;
  version: number;
  targetLang?: string;
  storyHandoff: StoryHandoff;
}): Promise<void> {
  await connectMongo();
  const target_lang = opts.targetLang ?? 'pt-PT';
  const lesson = await getLessonVersion(opts.day, opts.version, target_lang);
  if (!lesson) throw new Error(`No draft day=${opts.day} v${opts.version}`);
  const data = lesson.data as PartialLessonData & {
    outline?: OutlineResult;
    pages?: (Page | null)[];
    lesson?: Record<string, unknown>;
  };
  const outline = data.outline;
  if (!outline?.pages?.length) {
    // Outline not ready yet — handoff alone is enough; outline will pick it up.
    return;
  }

  const story_id = opts.storyHandoff.story_id;
  type OutlinePage = OutlineResult['pages'][number];
  let pages: OutlinePage[] = [...outline.pages];
  const hasIntro = pages.some(
    (p) => p.role === 'intro' || (p.index === 0 && p.preset === 'story'),
  );
  if (!hasIntro) {
    const intro: OutlinePage = {
      index: 0,
      page_id: 'p0_story',
      preset: 'story',
      mode: modeForPreset('story'),
      role: 'intro',
      title: 'القصة',
      purpose: 'شوف الموقف قبل التفصيل',
      introduces: [],
      assumes: [
        ...((data.lesson as { recycle_ids?: string[] } | undefined)
          ?.recycle_ids ?? []),
      ],
      handoff: `story_id:${story_id}`,
    };
    pages = [intro, ...pages].map((p, i) => ({
      ...p,
      index: i,
      page_id: `p${i}_${p.preset}`,
    }));
  } else {
    pages = pages.map((p) =>
      p.role === 'intro' || p.preset === 'story'
        ? { ...p, handoff: `story_id:${story_id}` }
        : p,
    );
  }

  const stubIntro = {
    id: pages[0]!.page_id,
    preset: 'story' as const,
    mode: modeForPreset('story'),
    role: 'intro' as const,
    story_id,
    title: [{ text: 'القصة', lang: 'eg' as const }],
    blocks: [] as Page['blocks'],
  };

  const existingPages = Array.isArray(data.pages) ? [...data.pages] : [];
  let nextPages: (Page | null)[] = existingPages.map((p) => p ?? null);
  if (!hasIntro) {
    nextPages = [stubIntro as unknown as Page, ...nextPages];
  } else {
    nextPages = nextPages.map((p, i) => {
      if (i === 0 || (p && p.preset === 'story')) {
        return { ...(p ?? {}), ...stubIntro, id: pages[0]!.page_id } as Page;
      }
      return p;
    });
    if (!nextPages[0]) nextPages[0] = stubIntro as unknown as Page;
  }

  const nextOutline: OutlineResult = { ...outline, pages };
  const prevLesson = (data.lesson ?? {}) as PartialLessonData['lesson'] &
    Record<string, unknown>;
  await updateDraft({
    day: opts.day,
    targetLang: target_lang,
    version: opts.version,
    pack: {
      ...data,
      outline: nextOutline,
      lesson: {
        ...prevLesson,
        id: lessonIdFor(opts.day, target_lang),
        target_lang,
        day: opts.day,
        kind: (prevLesson?.kind as 'lesson' | 'story' | 'review') ?? 'lesson',
        story_id,
        pages: pages.map((p) => p.page_id),
      },
      pages: nextPages,
    },
    meta: { story_missing: false, outline: nextOutline },
    mergeMeta: true,
  });
  await setDraftHandoff({
    day: opts.day,
    targetLang: target_lang,
    version: opts.version,
    key: 'story',
    value: opts.storyHandoff,
  });
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
      case 'questions': {
        const rwIds = opts.items
          .filter(
            (i) =>
              i.id.startsWith('phrase.rw.') ||
              (i as { real_world?: boolean }).real_world,
          )
          .map((i) => i.id);
        return hashQuestionsJob(brief, known, outline?.pages ?? [], rwIds);
      }
      case 'micro':
        return hashMicroJob(brief, known, dayPlan.generation?.micro_step);
      case 'daily_use':
        return hashDailyUseJob(brief, known, brief.recycle_ids);
      case 'real_world':
        return hashRealWorldJob(brief, known, brief.authored_real_world);
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
