import { connectMongo, mongoConfigured } from '@/lib/mongo';
import type { LessonPack } from '@/lib/v2/content/lesson';
import type { Issue } from '@/lib/v2/content/validate';
import { V2LessonModel } from '@/lib/v2/mongo/models';
import type { CallTiming, DayCost } from './cost';
import type { GenerationStages, OutlineResult, PartialLessonData } from './stages/types';

/** Structured critic issue on draft meta (may be resolved_by lang_check). */
export type CriticIssueRecord = {
  path: string;
  message: string;
  severity: 'high' | 'medium' | 'low';
  page_index: number;
  resolved_by?: 'lang_check';
};

export type GenerationMeta = {
  flagged?: boolean;
  issues?: Issue[];
  cost?: DayCost;
  image_flags?: string[];
  generated_at?: string;
  stages?: GenerationStages;
  timing?: CallTiming[];
  outline?: OutlineResult;
  job_id?: string;
  /** Linked-jobs DAG: continuity regen gate (0 | 1). */
  regen_round?: number;
  job_graph?: boolean;
  text_ready?: boolean;
  /** Per-block critic: keys `${pageIndex}:${blockKey}`, at most one regen each. */
  critic_regen?: Record<string, number>;
  critic_notes?: Record<string, string[]>;
  /** One-shot block targets for the next page job (`pageIndex` → block keys). */
  critic_block_targets?: Record<string, string[]>;
  /** Structured critic issues (may be resolved_by lang_check). */
  critic_issues?: CriticIssueRecord[];
  lang_check?: unknown;
  /** Code-derived digests for dependents (`items`, `outline`, `page:0`, …). */
  handoffs?: Record<string, unknown>;
};

export type SavedLesson = {
  day: number;
  target_lang: string;
  version: number;
  status: 'draft' | 'reviewed' | 'published';
  data: LessonPack;
  meta?: GenerationMeta;
};

export async function saveDraft(opts: {
  day: number;
  targetLang?: string;
  pack: LessonPack | PartialLessonData;
  meta?: GenerationMeta;
}): Promise<SavedLesson> {
  if (!mongoConfigured()) {
    throw new Error('MongoDB not configured');
  }
  await connectMongo();
  const target_lang = opts.targetLang ?? 'pt-PT';
  const Model = V2LessonModel();
  const latest = await Model.findOne({ day: opts.day, target_lang })
    .sort({ version: -1 })
    .select({ version: 1 })
    .lean();
  const version = (latest?.version ?? 0) + 1;

  const doc = await Model.create({
    day: opts.day,
    target_lang,
    version,
    status: 'draft',
    data: opts.pack,
    meta: {
      ...opts.meta,
      generated_at: new Date().toISOString(),
    },
  });

  return {
    day: doc.day,
    target_lang: doc.target_lang,
    version: doc.version,
    status: doc.status as 'draft',
    data: doc.data as LessonPack,
    meta: doc.meta as GenerationMeta | undefined,
  };
}

/** Update an existing draft version in place (resume / stage progress). */
export async function updateDraft(opts: {
  day: number;
  targetLang?: string;
  version: number;
  pack?: LessonPack | PartialLessonData;
  meta?: GenerationMeta;
  mergeMeta?: boolean;
}): Promise<SavedLesson> {
  if (!mongoConfigured()) {
    throw new Error('MongoDB not configured');
  }
  await connectMongo();
  const target_lang = opts.targetLang ?? 'pt-PT';
  const Model = V2LessonModel();
  const doc = await Model.findOne({
    day: opts.day,
    target_lang,
    version: opts.version,
  });
  if (!doc) {
    throw new Error(`No draft day=${opts.day} v${opts.version}`);
  }

  if (opts.pack != null) {
    doc.data = opts.pack;
  }
  if (opts.meta != null) {
    const prev = (doc.meta ?? {}) as GenerationMeta;
    doc.meta = opts.mergeMeta === false ? opts.meta : { ...prev, ...opts.meta };
  }
  doc.markModified('data');
  doc.markModified('meta');
  await doc.save();

  return {
    day: doc.day,
    target_lang: doc.target_lang,
    version: doc.version,
    status: doc.status as SavedLesson['status'],
    data: doc.data as LessonPack,
    meta: doc.meta as GenerationMeta | undefined,
  };
}

/**
 * Atomically set one page slot so parallel page jobs do not clobber each other.
 */
export async function updateDraftPage(opts: {
  day: number;
  targetLang?: string;
  version: number;
  pageIndex: number;
  page: unknown;
}): Promise<void> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const target_lang = opts.targetLang ?? 'pt-PT';
  const res = await V2LessonModel().updateOne(
    { day: opts.day, target_lang, version: opts.version },
    { $set: { [`data.pages.${opts.pageIndex}`]: opts.page } },
  );
  if (res.matchedCount === 0) {
    throw new Error(
      `No draft day=${opts.day} v${opts.version} for page ${opts.pageIndex}`,
    );
  }
}

/**
 * Atomically patch top-level keys under data.* (safe under parallel fan-out).
 */
export async function updateDraftFields(opts: {
  day: number;
  targetLang?: string;
  version: number;
  fields: Record<string, unknown>;
  meta?: GenerationMeta;
  mergeMeta?: boolean;
}): Promise<void> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const target_lang = opts.targetLang ?? 'pt-PT';
  const $set: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(opts.fields)) {
    $set[`data.${key}`] = value;
  }
  if (opts.meta) {
    if (opts.mergeMeta === false) {
      $set.meta = opts.meta;
    } else {
      for (const [key, value] of Object.entries(opts.meta)) {
        $set[`meta.${key}`] = value;
      }
    }
  }
  const res = await V2LessonModel().updateOne(
    { day: opts.day, target_lang, version: opts.version },
    { $set },
  );
  if (res.matchedCount === 0) {
    throw new Error(`No draft day=${opts.day} v${opts.version}`);
  }
}

/** Merge one handoff key under meta.handoffs without clobbering siblings. */
export async function setDraftHandoff(opts: {
  day: number;
  targetLang?: string;
  version: number;
  key: string;
  value: unknown;
}): Promise<void> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const target_lang = opts.targetLang ?? 'pt-PT';
  const res = await V2LessonModel().updateOne(
    { day: opts.day, target_lang, version: opts.version },
    { $set: { [`meta.handoffs.${opts.key}`]: opts.value } },
  );
  if (res.matchedCount === 0) {
    throw new Error(`No draft day=${opts.day} v${opts.version}`);
  }
}

export async function getLessonVersion(
  day: number,
  version: number,
  targetLang = 'pt-PT',
): Promise<SavedLesson | null> {
  if (!mongoConfigured()) return null;
  await connectMongo();
  const doc = await V2LessonModel()
    .findOne({ day, target_lang: targetLang, version })
    .lean();
  if (!doc) return null;
  return {
    day: doc.day,
    target_lang: doc.target_lang,
    version: doc.version,
    status: doc.status as SavedLesson['status'],
    data: doc.data as LessonPack,
    meta: (doc as { meta?: GenerationMeta }).meta,
  };
}

export async function setLessonStatus(opts: {
  day: number;
  targetLang?: string;
  /** Published is only allowed via publishLesson(). */
  status: 'draft' | 'reviewed';
  version?: number;
}): Promise<SavedLesson> {
  if (!mongoConfigured()) {
    throw new Error('MongoDB not configured');
  }
  if ((opts.status as string) === 'published') {
    throw new Error(
      "setLessonStatus refuses 'published' — use publishLesson()",
    );
  }
  await connectMongo();
  const target_lang = opts.targetLang ?? 'pt-PT';
  const Model = V2LessonModel();

  const query: Record<string, unknown> = { day: opts.day, target_lang };
  if (opts.version != null) query.version = opts.version;

  const doc = await Model.findOne(query).sort({ version: -1 });
  if (!doc) {
    throw new Error(`No lesson for day ${opts.day}`);
  }

  doc.status = opts.status;
  await doc.save();

  return {
    day: doc.day,
    target_lang: doc.target_lang,
    version: doc.version,
    status: doc.status as SavedLesson['status'],
    data: doc.data as LessonPack,
    meta: (doc as { meta?: GenerationMeta }).meta,
  };
}

export async function getLatestLesson(
  day: number,
  targetLang = 'pt-PT',
): Promise<SavedLesson | null> {
  if (!mongoConfigured()) return null;
  await connectMongo();
  const doc = await V2LessonModel()
    .findOne({ day, target_lang: targetLang })
    .sort({ version: -1 })
    .lean();
  if (!doc) return null;
  return {
    day: doc.day,
    target_lang: doc.target_lang,
    version: doc.version,
    status: doc.status as SavedLesson['status'],
    data: doc.data as LessonPack,
    meta: (doc as { meta?: GenerationMeta }).meta,
  };
}

export async function listLatestLessons(
  targetLang = 'pt-PT',
): Promise<SavedLesson[]> {
  if (!mongoConfigured()) return [];
  await connectMongo();
  const docs = await V2LessonModel()
    .find({ target_lang: targetLang })
    .sort({ day: 1, version: -1 })
    .lean();

  const byDay = new Map<number, SavedLesson>();
  for (const doc of docs) {
    if (byDay.has(doc.day)) continue;
    byDay.set(doc.day, {
      day: doc.day,
      target_lang: doc.target_lang,
      version: doc.version,
      status: doc.status as SavedLesson['status'],
      data: doc.data as LessonPack,
      meta: (doc as { meta?: GenerationMeta }).meta,
    });
  }
  return [...byDay.values()].sort((a, b) => a.day - b.day);
}

export async function loadPriorPacks(
  beforeDay: number,
  targetLang = 'pt-PT',
): Promise<LessonPack[]> {
  if (!mongoConfigured()) return [];
  await connectMongo();
  const docs = await V2LessonModel()
    .find({
      target_lang: targetLang,
      day: { $lt: beforeDay },
      status: { $in: ['published', 'reviewed'] },
    })
    .sort({ day: 1, version: -1 })
    .lean();

  const byDay = new Map<number, LessonPack>();
  for (const doc of docs) {
    if (byDay.has(doc.day)) continue;
    byDay.set(doc.day, doc.data as LessonPack);
  }
  return [...byDay.values()];
}
