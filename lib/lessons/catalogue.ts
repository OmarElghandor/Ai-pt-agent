import { adaptMongoPack } from './adaptMongoPack';
import { assertValidLessonCatalogue, loadLessonPacks } from './load';
import type { LessonPack } from './types';
import { mongoConfigured } from '@/lib/mongo';
import { listCurrentPracticeLessons, getLivePackDoc } from '@/lib/mongo/practiceLesson';

let cachedLive: LessonPack[] | null = null;
let cachedTest: LessonPack[] | null = null;
/** Adapted Mongo packs keyed by lesson_key. */
let mongoPacks: Map<string, LessonPack> = new Map();
let mongoRefreshAt = 0;
const MONGO_TTL_MS = 30_000;

function ensureJsonLoaded(): void {
  if (cachedLive && cachedTest) return;
  const { live, testOnly } = assertValidLessonCatalogue();
  cachedLive = live;
  cachedTest = testOnly;
}

/** Live catalogue: JSON live packs + Mongo live/reviewed packs. */
export function liveLessons(): LessonPack[] {
  ensureJsonLoaded();
  const byId = new Map<string, LessonPack>();
  for (const pack of cachedLive!) byId.set(pack.id, pack);
  for (const pack of mongoPacks.values()) byId.set(pack.id, pack);
  return [...byId.values()];
}

/** Test-only packs for development (never offered in the live opener). */
export function testLessons(): LessonPack[] {
  ensureJsonLoaded();
  return cachedTest!;
}

export function allValidLessons(): LessonPack[] {
  return [...liveLessons(), ...testLessons()];
}

export function lessonById(id: string | null | undefined): LessonPack | null {
  if (!id) return null;
  return allValidLessons().find((l) => l.id === id) ?? null;
}

/** JSON catalogue only. Mongo packs are not included. */
export function isJsonLesson(id: string | null | undefined): boolean {
  if (!id) return false;
  ensureJsonLoaded();
  return (
    cachedLive!.some((pack) => pack.id === id) || cachedTest!.some((pack) => pack.id === id)
  );
}

/** Soft reload used by scripts/tests. */
export function reloadLessonCatalogue(): ReturnType<typeof loadLessonPacks> {
  cachedLive = null;
  cachedTest = null;
  mongoPacks = new Map();
  mongoRefreshAt = 0;
  const report = loadLessonPacks();
  cachedLive = report.live;
  cachedTest = report.testOnly;
  return report;
}

/** Load / refresh Mongo live packs into the in-memory catalogue. */
export async function refreshMongoCatalogue(force = false): Promise<number> {
  if (!mongoConfigured()) return 0;
  const now = Date.now();
  if (!force && now - mongoRefreshAt < MONGO_TTL_MS && mongoPacks.size > 0) {
    return mongoPacks.size;
  }

  const rows = await listCurrentPracticeLessons();
  const next = new Map<string, LessonPack>();
  for (const row of rows) {
    if (!row.hasPack) continue;
    const doc = await getLivePackDoc(row.lessonKey);
    if (!doc) continue;
    const adapted = adaptDoc(doc);
    if (adapted) next.set(adapted.id, adapted);
  }
  mongoPacks = next;
  mongoRefreshAt = now;
  return next.size;
}

function adaptDoc(doc: {
  lesson_key: string;
  cefr_level?: string;
  topic?: string;
  version?: number;
  status?: string;
  cell_ids?: string[];
  requirements?: { cells?: string[]; words?: string[] } | null;
  spec?: unknown;
  pack?: unknown;
  audio_cache_refs?: { key?: string | null; url?: string | null; language?: string | null }[] | null;
}): LessonPack | null {
  return adaptMongoPack({
    lesson_key: doc.lesson_key,
    cefr_level: doc.cefr_level,
    topic: doc.topic,
    version: doc.version,
    status: doc.status,
    cell_ids: doc.cell_ids,
    requirements: doc.requirements
      ? {
          cells: doc.requirements.cells ?? [],
          words: doc.requirements.words ?? [],
        }
      : undefined,
    spec: (doc.spec as Record<string, unknown> | null) ?? null,
    pack: (doc.pack as Record<string, unknown> | null) ?? null,
    audio_cache_refs: (doc.audio_cache_refs ?? []).map((r) => ({
      key: r.key ?? undefined,
      url: r.url ?? undefined,
      language: r.language ?? undefined,
    })),
  });
}

/** Ensure a single Mongo lesson is in the catalogue (e.g. after generate). */
export async function ensureMongoLesson(lessonKey: string): Promise<LessonPack | null> {
  const cached = mongoPacks.get(lessonKey);
  if (cached) return cached;
  if (!mongoConfigured()) return null;
  const doc = await getLivePackDoc(lessonKey);
  if (!doc) return null;
  const adapted = adaptDoc(doc);
  if (adapted) {
    mongoPacks.set(adapted.id, adapted);
  }
  return adapted;
}

export { loadLessonPacks, assertValidLessonCatalogue };
