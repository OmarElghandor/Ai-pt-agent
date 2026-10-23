import { mongoConfigured } from '@/lib/mongo';
import { listCurrentPracticeLessons, type LessonPlanRow } from '@/lib/mongo/practiceLesson';
import { loadUserProgress, type KnownProgress } from '@/lib/mongo/userProgress';
import {
  loadPracticeProgress,
  type PracticeLessonProgressRow,
} from '@/lib/mongo/practiceProgress';
import { liveLessons, testLessons } from './catalogue';
import { loadSeedPlan, seedPlanExists } from './seedPlan';

export type LearnerLessonUiStatus =
  | 'locked'
  | 'available'
  | 'updating'
  | 'done'
  | 'assessment_due';

export type LearnerLessonRow = {
  lessonKey: string;
  titleAr: string;
  situationAr: string | null;
  chipLabel: string;
  cefrLevel: string;
  uiStatus: LearnerLessonUiStatus;
  hasPack: boolean;
  status: string | null;
  generationStage: string | null;
  missingCells: string[];
  missingWords: string[];
  version: number | null;
  requirements: { cells: string[]; words: string[] };
  source: 'generated' | 'hand' | 'json' | null;
};

const ASSESSMENT_COOLDOWN_MS = 12 * 60 * 60 * 1000;

function uiStatusFor(
  _requirements: { cells: string[]; words: string[] },
  status: string | null,
  _known: KnownProgress | null,
  practiceRow: PracticeLessonProgressRow | undefined,
  localPractisedAt?: number,
): { uiStatus: LearnerLessonUiStatus; missingCells: string[]; missingWords: string[] } {
  if (status === 'updating' || status === 'generating') {
    return { uiStatus: 'updating', missingCells: [], missingWords: [] };
  }

  // Unlock gate disabled: every lesson is open (ignore cell/word requirements).
  const practicedAt = practiceRow?.finishedAt ?? localPractisedAt ?? null;
  if (practicedAt) {
    const due = practiceRow?.assessmentDueAt ?? practicedAt + ASSESSMENT_COOLDOWN_MS;
    if (Date.now() >= due) {
      return { uiStatus: 'assessment_due', missingCells: [], missingWords: [] };
    }
    return { uiStatus: 'done', missingCells: [], missingWords: [] };
  }

  return { uiStatus: 'available', missingCells: [], missingWords: [] };
}

function jsonPackFallback(
  localLessons?: Record<string, { practisedAt?: number }>,
  regenerateEnabled?: boolean,
): {
  lessons: LearnerLessonRow[];
  regenerateEnabled: boolean;
  source: 'json';
} {
  const allowTest =
    process.env.NODE_ENV !== 'production' || process.env.ALLOW_TEST_LESSONS === '1';
  const packs = allowTest ? [...liveLessons(), ...testLessons()] : liveLessons();
  const lessons: LearnerLessonRow[] = packs.map((pack) => {
    const practisedAt = localLessons?.[pack.id]?.practisedAt;
    let uiStatus: LearnerLessonUiStatus = 'available';
    if (practisedAt) {
      uiStatus =
        Date.now() - practisedAt >= ASSESSMENT_COOLDOWN_MS ? 'assessment_due' : 'done';
    }
    return {
      lessonKey: pack.id,
      titleAr: pack.titleAr,
      situationAr: pack.situationAr ?? null,
      chipLabel: pack.chipLabel,
      cefrLevel: pack.level,
      uiStatus,
      hasPack: true,
      status: 'live',
      generationStage: null,
      missingCells: [],
      missingWords: [],
      version: pack.version ?? 1,
      requirements: pack.requirements ?? { cells: [], words: [] },
      source: 'json',
    };
  });

  return {
    lessons,
    regenerateEnabled: Boolean(regenerateEnabled),
    source: 'json',
  };
}

/** Pure merge: seed order + optional Mongo rows + unlock state. Exported for tests. */
export function mergeSeedWithMongo(
  seedSlots: ReturnType<typeof loadSeedPlan>,
  mongoRows: LessonPlanRow[],
  known: KnownProgress | null,
  localLessons?: Record<string, { practisedAt?: number }>,
  practiceLessons: PracticeLessonProgressRow[] = [],
): LearnerLessonRow[] {
  const mongoByKey = new Map(mongoRows.map((r) => [r.lessonKey, r]));
  const practiceByKey = new Map(practiceLessons.map((p) => [p.lessonKey, p]));
  return seedSlots.map((seed) => {
    const mongo = mongoByKey.get(seed.lessonKey);
    const requirements = mongo?.requirements ?? seed.requirements;
    const status = mongo?.status ?? null;
    const local = localLessons?.[seed.lessonKey]?.practisedAt;
    const { uiStatus, missingCells, missingWords } = uiStatusFor(
      requirements,
      status,
      known,
      practiceByKey.get(seed.lessonKey),
      local,
    );

    const titleAr = mongo?.titleAr || seed.titleAr;
    const situationAr = mongo?.situationAr || seed.situationAr || null;

    return {
      lessonKey: seed.lessonKey,
      titleAr,
      situationAr,
      chipLabel: titleAr,
      cefrLevel: mongo?.cefrLevel || seed.cefrLevel,
      uiStatus,
      hasPack: Boolean(mongo?.hasPack),
      status,
      generationStage: mongo?.generationStage ?? null,
      missingCells,
      missingWords,
      version: mongo?.version ?? null,
      requirements,
      source: mongo?.source ?? null,
    };
  });
}

/**
 * Full lesson plan for a learner.
 * Seed-first ordered list, overlaid with practice_lessons when present.
 */
export async function getLearnerLessonPlan(
  learnerId: string,
  localLessons?: Record<string, { practisedAt?: number }>,
): Promise<{
  lessons: LearnerLessonRow[];
  regenerateEnabled: boolean;
  source: 'seed' | 'seed+mongo' | 'json';
}> {
  const regenerateEnabled = process.env.PRACTICE_LESSON_REGENERATE === 'true';

  if (!seedPlanExists()) {
    return jsonPackFallback(localLessons, regenerateEnabled);
  }

  const seedSlots = loadSeedPlan();
  let mongoRows: LessonPlanRow[] = [];
  let known: KnownProgress | null = null;
  let practiceLessons: PracticeLessonProgressRow[] = [];

  if (mongoConfigured()) {
    const [rows, progress, practice] = await Promise.all([
      listCurrentPracticeLessons(),
      loadUserProgress(learnerId),
      loadPracticeProgress(learnerId),
    ]);
    mongoRows = rows;
    known = progress;
    practiceLessons = practice?.lessons ?? [];
  }

  const lessons = mergeSeedWithMongo(
    seedSlots,
    mongoRows,
    known,
    localLessons,
    practiceLessons,
  );

  return {
    lessons,
    regenerateEnabled,
    source: mongoConfigured() ? 'seed+mongo' : 'seed',
  };
}
