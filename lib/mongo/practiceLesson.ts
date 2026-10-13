import { adaptMongoPack } from '@/lib/lessons/adaptMongoPack';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { PracticeLessonModel, type PracticeLessonDoc } from './models';

export type LessonPlanRow = {
  lessonKey: string;
  topic: string;
  depthTier: number;
  cefrLevel: string;
  curriculumPoint: number;
  cellIds: string[];
  titleAr: string | null;
  situationAr: string | null;
  situationEn: string | null;
  status: PracticeLessonDoc['status'] | null;
  version: number | null;
  requirements: { cells: string[]; words: string[] };
  hasSpec: boolean;
  hasPack: boolean;
  generationStage: string | null;
  needsOmarReview: boolean;
  audioCacheRefs: { key: string; url: string; language: string }[];
};

/** A stored pack counts only when it adapts into a playable story. */
function playableStoryPack(doc: PracticeLessonDoc): boolean {
  if (!doc.pack || (doc.status !== 'live' && doc.status !== 'reviewed')) return false;
  if (typeof doc.pack !== 'object') return false;
  return (
    adaptMongoPack({
      lesson_key: doc.lesson_key,
      cefr_level: doc.cefr_level,
      topic: doc.topic,
      version: doc.version,
      status: doc.status,
      cell_ids: doc.cell_ids ?? [],
      requirements: doc.requirements
        ? {
            cells: doc.requirements.cells ?? [],
            words: doc.requirements.words ?? [],
          }
        : undefined,
      spec: (doc.spec as Record<string, unknown> | null) ?? null,
      pack: doc.pack as Record<string, unknown>,
      audio_cache_refs: (doc.audio_cache_refs ?? []).map((ref) => ({
        key: ref.key ?? undefined,
        url: ref.url ?? undefined,
        language: ref.language ?? undefined,
      })),
    }) !== null
  );
}

function toPlanRow(doc: PracticeLessonDoc): LessonPlanRow {
  const spec = (doc.spec ?? {}) as Record<string, unknown>;
  const status = doc.status;
  return {
    lessonKey: doc.lesson_key,
    topic: doc.topic,
    depthTier: doc.depth_tier,
    cefrLevel: doc.cefr_level,
    curriculumPoint: doc.curriculum_point,
    cellIds: doc.cell_ids ?? [],
    titleAr: typeof spec.title_ar === 'string' ? spec.title_ar : null,
    situationAr: typeof spec.situation_ar === 'string' ? spec.situation_ar : null,
    situationEn: typeof spec.situation_en === 'string' ? spec.situation_en : null,
    status,
    version: doc.version ?? null,
    requirements: {
      cells: doc.requirements?.cells ?? doc.cell_ids ?? [],
      words: doc.requirements?.words ?? [],
    },
    hasSpec: Boolean(spec.title_ar),
    hasPack: playableStoryPack(doc),
    generationStage: doc.generation_stage ?? null,
    needsOmarReview: Boolean(doc.needs_omar_review),
    audioCacheRefs: (doc.audio_cache_refs ?? []).map((r) => ({
      key: r.key ?? '',
      url: r.url ?? '',
      language: r.language ?? '',
    })),
  };
}

export async function listCurrentPracticeLessons(): Promise<LessonPlanRow[]> {
  if (!mongoConfigured()) return [];
  await connectMongo();
  const docs = await PracticeLessonModel()
    .find({ is_current: true })
    .sort({ curriculum_point: 1, depth: 1, depth_tier: 1 })
    .lean<PracticeLessonDoc[]>();
  return docs.map(toPlanRow);
}

export async function getCurrentPracticeLesson(
  lessonKey: string,
): Promise<(PracticeLessonDoc & { _id: unknown }) | null> {
  if (!mongoConfigured()) return null;
  await connectMongo();
  return PracticeLessonModel()
    .findOne({ lesson_key: lessonKey, is_current: true })
    .lean<PracticeLessonDoc & { _id: unknown }>();
}

export async function getLivePackDoc(
  lessonKey: string,
): Promise<(PracticeLessonDoc & { _id: unknown }) | null> {
  const doc = await getCurrentPracticeLesson(lessonKey);
  if (!doc) return null;
  if (!doc.pack || (doc.status !== 'live' && doc.status !== 'reviewed')) return null;
  return doc;
}

export async function getGenerationStatusFromMongo(lessonKey: string): Promise<{
  status: string | null;
  stage: string | null;
  hasPack: boolean;
  error: string | null;
} | null> {
  const doc = await getCurrentPracticeLesson(lessonKey);
  if (!doc) return null;
  return {
    status: doc.status ?? null,
    stage: doc.generation_stage ?? null,
    hasPack: playableStoryPack(doc),
    error: doc.generation_error ?? null,
  };
}
