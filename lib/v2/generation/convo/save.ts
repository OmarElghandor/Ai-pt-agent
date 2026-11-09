import { connectMongo, mongoConfigured } from '@/lib/mongo';
import type { ConvoPackData } from '@/lib/v2/convo/pack/schema';
import { V2ConvoPackModel } from '@/lib/v2/mongo/models';

export type ConvoPackMeta = {
  flagged?: boolean;
  issues?: unknown[];
  lesson_version?: number;
  stale?: boolean;
  stale_reason?: string;
  text_ready?: boolean;
  audio_ready?: boolean;
  handoffs?: Record<string, unknown>;
  generated_at?: string;
  job_graph?: boolean;
  warnings?: string[];
  /** Accepted answer forms per item id (from assemble). */
  accepted_forms?: Record<string, string[]>;
};

export type SavedConvoPack = {
  day: number;
  target_lang: string;
  version: number;
  status: 'draft' | 'reviewed' | 'published';
  data: Partial<ConvoPackData> & Record<string, unknown>;
  meta?: ConvoPackMeta;
};

export function convoPackIdFor(day: number, targetLang = 'pt-PT'): string {
  return `${targetLang}.day-${day}`;
}

export async function saveConvoPackDraft(opts: {
  day: number;
  targetLang?: string;
  data: Partial<ConvoPackData> & Record<string, unknown>;
  meta?: ConvoPackMeta;
}): Promise<SavedConvoPack> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const target_lang = opts.targetLang ?? 'pt-PT';
  const Model = V2ConvoPackModel();
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
    data: doc.data as SavedConvoPack['data'],
    meta: doc.meta as ConvoPackMeta | undefined,
  };
}

export async function updateConvoPackDraft(opts: {
  day: number;
  targetLang?: string;
  version: number;
  data?: Partial<ConvoPackData> & Record<string, unknown>;
  meta?: ConvoPackMeta;
  mergeMeta?: boolean;
}): Promise<SavedConvoPack | null> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const target_lang = opts.targetLang ?? 'pt-PT';
  const Model = V2ConvoPackModel();
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
    status: existing.status as SavedConvoPack['status'],
    data: existing.data as SavedConvoPack['data'],
    meta: existing.meta as ConvoPackMeta | undefined,
  };
}

export async function setConvoHandoff(opts: {
  day: number;
  targetLang?: string;
  version: number;
  key: string;
  value: unknown;
}): Promise<void> {
  const target_lang = opts.targetLang ?? 'pt-PT';
  await connectMongo();
  await V2ConvoPackModel().updateOne(
    { day: opts.day, target_lang, version: opts.version },
    { $set: { [`meta.handoffs.${opts.key}`]: opts.value } },
  );
}

export async function getLatestConvoPack(
  day: number,
  targetLang = 'pt-PT',
): Promise<SavedConvoPack | null> {
  if (!mongoConfigured()) return null;
  await connectMongo();
  const doc = await V2ConvoPackModel()
    .findOne({ day, target_lang: targetLang })
    .sort({ version: -1 })
    .lean();
  if (!doc) return null;
  return {
    day: doc.day,
    target_lang: doc.target_lang,
    version: doc.version,
    status: doc.status as SavedConvoPack['status'],
    data: doc.data as SavedConvoPack['data'],
    meta: doc.meta as ConvoPackMeta | undefined,
  };
}

export async function getPublishedConvoPack(
  day: number,
  targetLang = 'pt-PT',
): Promise<SavedConvoPack | null> {
  if (!mongoConfigured()) return null;
  await connectMongo();
  const doc = await V2ConvoPackModel()
    .findOne({ day, target_lang: targetLang, status: 'published' })
    .sort({ version: -1 })
    .lean();
  if (!doc) return null;
  return {
    day: doc.day,
    target_lang: doc.target_lang,
    version: doc.version,
    status: 'published',
    data: doc.data as SavedConvoPack['data'],
    meta: doc.meta as ConvoPackMeta | undefined,
  };
}

export async function getConvoPackVersion(
  day: number,
  version: number,
  targetLang = 'pt-PT',
): Promise<SavedConvoPack | null> {
  if (!mongoConfigured()) return null;
  await connectMongo();
  const doc = await V2ConvoPackModel()
    .findOne({ day, target_lang: targetLang, version })
    .lean();
  if (!doc) return null;
  return {
    day: doc.day,
    target_lang: doc.target_lang,
    version: doc.version,
    status: doc.status as SavedConvoPack['status'],
    data: doc.data as SavedConvoPack['data'],
    meta: doc.meta as ConvoPackMeta | undefined,
  };
}
