import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { LessonPackSchema, type LessonPack } from '@/lib/v2/content/lesson';
import { V2LessonModel } from '@/lib/v2/mongo/models';

export type PublishedLesson = {
  day: number;
  target_lang: string;
  version: number;
  status: string;
  pack: LessonPack;
};

export type LessonDaySummary = {
  day: number;
  target_lang: string;
  version: number;
  status: 'draft' | 'reviewed' | 'published';
  situation?: { tl: string; eg: string };
};

/** Published lesson for a day, newest version. Null when Mongo is down or the day is missing. */
export async function getPublishedLesson(day: number): Promise<PublishedLesson | null> {
  if (!mongoConfigured()) return null;
  await connectMongo();
  const doc = await V2LessonModel()
    .findOne({ day, status: 'published' })
    .sort({ version: -1 })
    .lean();
  if (!doc) return null;
  // Mongo stores missing optionals as null; Zod `.optional()` rejects null.
  const parsed = LessonPackSchema.safeParse(coerceDraftPackData(doc.data));
  if (!parsed.success) {
    console.error(
      '[getPublishedLesson] pack parse failed',
      day,
      parsed.error.issues.slice(0, 8),
    );
    return null;
  }
  return {
    day: doc.day,
    target_lang: doc.target_lang,
    version: doc.version,
    status: doc.status,
    pack: parsed.data,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Zod `.optional()` rejects null. Drop null object keys. Leave nulls that
 * sit inside arrays (`why_wrong_eg` allows those).
 */
function stripNullObjectFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) =>
      entry === null ? null : stripNullObjectFields(entry),
    );
  }
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null) continue;
    out[key] = stripNullObjectFields(entry);
  }
  return out;
}

/**
 * Soften Mongo nulls on optional fields so draft packs parse with Zod
 * (`.optional()` rejects null). Used by getLatestLessonPack for /day/[n].
 */
function coerceDraftPackData(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  const clone = stripNullObjectFields(structuredClone(data)) as {
    pages?: {
      quiz?: unknown | null;
      check?: unknown | null;
      explain?: unknown | null;
      steps?: unknown | null;
      controls?: unknown | null;
      blocks?: unknown | null;
      options?: unknown | null;
      cover?: unknown | null;
      subtitle?: unknown | null;
    }[];
    questions?: {
      feedback_eg?: unknown | null;
      why_wrong_eg?: unknown | null;
      options?: unknown | null;
      tests?: unknown | null;
      page_index?: unknown | null;
      tool_id?: unknown | null;
    }[];
    items?: {
      slots?: { fills?: unknown | null; tl?: unknown; name_eg?: unknown }[];
    }[];
  };
  for (const page of clone.pages ?? []) {
    if (!page) continue;
    if (page.quiz == null) delete page.quiz;
    if (page.check == null) delete page.check;
    if (page.explain == null) delete page.explain;
    if (page.steps == null) delete page.steps;
    if (page.controls == null) delete page.controls;
    if (page.cover == null) delete page.cover;
    if (page.subtitle == null) delete page.subtitle;
    if (page.blocks == null) page.blocks = [];
    if (page.options == null) delete page.options;
  }
  for (const q of clone.questions ?? []) {
    if (!q) continue;
    if (q.feedback_eg == null) delete q.feedback_eg;
    if (q.why_wrong_eg == null) delete q.why_wrong_eg;
    if (q.options == null) delete q.options;
    if (q.tests == null) delete q.tests;
    if (q.page_index == null) delete q.page_index;
    if (q.tool_id == null) delete q.tool_id;
  }
  for (const item of clone.items ?? []) {
    if (!item?.slots) continue;
    for (const slot of item.slots) {
      if (!slot) continue;
      if (slot.fills == null) {
        if (typeof slot.tl === 'string' && slot.tl.trim()) {
          delete slot.fills;
        } else {
          slot.fills = [];
        }
      }
    }
  }
  return clone;
}

/**
 * Latest lesson for a day regardless of status (newest version).
 * Used for local `?dev=1` preview when nothing is published yet.
 */
export async function getLatestLessonPack(
  day: number,
  targetLang = 'pt-PT',
): Promise<PublishedLesson | null> {
  if (!mongoConfigured()) return null;
  await connectMongo();
  const doc = await V2LessonModel()
    .findOne({ day, target_lang: targetLang })
    .sort({ version: -1 })
    .lean();
  if (!doc) return null;
  const parsed = LessonPackSchema.safeParse(coerceDraftPackData(doc.data));
  if (!parsed.success) return null;
  return {
    day: doc.day,
    target_lang: doc.target_lang,
    version: doc.version,
    status: doc.status,
    pack: parsed.data,
  };
}

function situationFromData(data: unknown): { tl: string; eg: string } | undefined {
  const lesson = (data as { lesson?: { situation?: { tl?: string; eg?: string } } })
    ?.lesson;
  const s = lesson?.situation;
  if (s?.tl && s?.eg) return { tl: s.tl, eg: s.eg };
  return undefined;
}

/** Newest published version per day. */
export async function listPublishedLessonSummaries(
  targetLang = 'pt-PT',
): Promise<LessonDaySummary[]> {
  if (!mongoConfigured()) return [];
  await connectMongo();
  const docs = await V2LessonModel()
    .find({ target_lang: targetLang, status: 'published' })
    .sort({ day: 1, version: -1 })
    .select({ day: 1, target_lang: 1, version: 1, status: 1, data: 1 })
    .lean();

  const byDay = new Map<number, LessonDaySummary>();
  for (const doc of docs) {
    if (byDay.has(doc.day)) continue;
    byDay.set(doc.day, {
      day: doc.day,
      target_lang: doc.target_lang,
      version: doc.version,
      status: 'published',
      situation: situationFromData(doc.data),
    });
  }
  return [...byDay.values()].sort((a, b) => a.day - b.day);
}

/** Newest version per day (any status). */
export async function listLatestLessonSummaries(
  targetLang = 'pt-PT',
): Promise<LessonDaySummary[]> {
  if (!mongoConfigured()) return [];
  await connectMongo();
  const docs = await V2LessonModel()
    .find({ target_lang: targetLang })
    .sort({ day: 1, version: -1 })
    .select({ day: 1, target_lang: 1, version: 1, status: 1, data: 1 })
    .lean();

  const byDay = new Map<number, LessonDaySummary>();
  for (const doc of docs) {
    if (byDay.has(doc.day)) continue;
    const status = doc.status as LessonDaySummary['status'];
    byDay.set(doc.day, {
      day: doc.day,
      target_lang: doc.target_lang,
      version: doc.version,
      status:
        status === 'published' || status === 'reviewed' ? status : 'draft',
      situation: situationFromData(doc.data),
    });
  }
  return [...byDay.values()].sort((a, b) => a.day - b.day);
}
