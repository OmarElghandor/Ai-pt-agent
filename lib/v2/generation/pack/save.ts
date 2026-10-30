import { connectMongo, mongoConfigured } from '@/lib/mongo';
import type { PracticePackData } from '@/lib/v2/content/pack';
import { V2PackModel } from '@/lib/v2/mongo/models';

export type PackMeta = {
  flagged?: boolean;
  issues?: unknown[];
  lesson_version?: number;
  stale?: boolean;
  stale_reason?: string;
  text_ready?: boolean;
  handoffs?: Record<string, unknown>;
  generated_at?: string;
  job_graph?: boolean;
};

export type SavedPack = {
  day: number;
  target_lang: string;
  version: number;
  status: 'draft' | 'reviewed' | 'published';
  data: PracticePackData;
  meta?: PackMeta;
};

export function packIdFor(day: number, targetLang = 'pt-PT'): string {
  return `${targetLang}.d${String(day).padStart(2, '0')}.pack`;
}

export async function savePackDraft(opts: {
  day: number;
  targetLang?: string;
  data: PracticePackData | Record<string, unknown>;
  meta?: PackMeta;
}): Promise<SavedPack> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const target_lang = opts.targetLang ?? 'pt-PT';
  const Model = V2PackModel();
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
    data: opts.data,
    meta: {
      ...opts.meta,
      generated_at: new Date().toISOString(),
      job_graph: true,
    },
  });
  return {
    day: doc.day,
    target_lang: doc.target_lang,
    version: doc.version,
    status: 'draft',
    data: doc.data as PracticePackData,
    meta: doc.meta as PackMeta | undefined,
  };
}

export async function updatePackDraft(opts: {
  day: number;
  targetLang?: string;
  version: number;
  data?: PracticePackData | Record<string, unknown>;
  meta?: PackMeta;
  mergeMeta?: boolean;
}): Promise<SavedPack | null> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const target_lang = opts.targetLang ?? 'pt-PT';
  const Model = V2PackModel();
  const existing = await Model.findOne({
    day: opts.day,
    target_lang,
    version: opts.version,
  });
  if (!existing) return null;
  if (opts.data) existing.data = opts.data;
  if (opts.meta) {
    existing.meta = opts.mergeMeta
      ? { ...(existing.meta as object), ...opts.meta }
      : opts.meta;
  }
  await existing.save();
  return {
    day: existing.day,
    target_lang: existing.target_lang,
    version: existing.version,
    status: existing.status as SavedPack['status'],
    data: existing.data as PracticePackData,
    meta: existing.meta as PackMeta | undefined,
  };
}

export async function setPackHandoff(opts: {
  day: number;
  targetLang?: string;
  version: number;
  key: string;
  value: unknown;
}): Promise<void> {
  const target_lang = opts.targetLang ?? 'pt-PT';
  await connectMongo();
  await V2PackModel().updateOne(
    { day: opts.day, target_lang, version: opts.version },
    { $set: { [`meta.handoffs.${opts.key}`]: opts.value } },
  );
}

export async function getLatestPack(
  day: number,
  targetLang = 'pt-PT',
): Promise<SavedPack | null> {
  if (!mongoConfigured()) return null;
  await connectMongo();
  const doc = await V2PackModel()
    .findOne({ day, target_lang: targetLang })
    .sort({ version: -1 })
    .lean();
  if (!doc) return null;
  return {
    day: doc.day,
    target_lang: doc.target_lang,
    version: doc.version,
    status: doc.status as SavedPack['status'],
    data: doc.data as PracticePackData,
    meta: doc.meta as PackMeta | undefined,
  };
}

export async function getPublishedPack(
  day: number,
  targetLang = 'pt-PT',
): Promise<SavedPack | null> {
  if (!mongoConfigured()) return null;
  await connectMongo();
  const doc = await V2PackModel()
    .findOne({ day, target_lang: targetLang, status: 'published' })
    .sort({ version: -1 })
    .lean();
  if (!doc) return null;
  return {
    day: doc.day,
    target_lang: doc.target_lang,
    version: doc.version,
    status: 'published',
    data: doc.data as PracticePackData,
    meta: doc.meta as PackMeta | undefined,
  };
}

export async function setPackStatus(opts: {
  day: number;
  targetLang?: string;
  version: number;
  status: 'draft' | 'reviewed' | 'published';
}): Promise<SavedPack | null> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const target_lang = opts.targetLang ?? 'pt-PT';
  const Model = V2PackModel();
  if (opts.status === 'published') {
    await Model.updateMany(
      {
        day: opts.day,
        target_lang,
        status: 'published',
        version: { $ne: opts.version },
      },
      { $set: { status: 'reviewed' } },
    );
  }
  const doc = await Model.findOneAndUpdate(
    { day: opts.day, target_lang, version: opts.version },
    { $set: { status: opts.status } },
    { new: true },
  ).lean();
  if (!doc) return null;
  return {
    day: doc.day,
    target_lang: doc.target_lang,
    version: doc.version,
    status: doc.status as SavedPack['status'],
    data: doc.data as PracticePackData,
    meta: doc.meta as PackMeta | undefined,
  };
}

/** Mark published/draft packs stale when lesson version advances. */
export async function markPacksStaleForLesson(opts: {
  day: number;
  targetLang?: string;
  lessonVersion: number;
}): Promise<number> {
  if (!mongoConfigured()) return 0;
  await connectMongo();
  const target_lang = opts.targetLang ?? 'pt-PT';
  const res = await V2PackModel().updateMany(
    {
      day: opts.day,
      target_lang,
      status: { $in: ['draft', 'reviewed', 'published'] },
      $or: [
        { 'meta.lesson_version': { $ne: opts.lessonVersion } },
        { 'meta.lesson_version': { $exists: false } },
      ],
    },
    {
      $set: {
        'meta.stale': true,
        'meta.stale_reason': `lesson republished as v${opts.lessonVersion}`,
      },
    },
  );
  return res.modifiedCount ?? 0;
}
