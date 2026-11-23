/**
 * Shared code-built practice questions (16 §9.1 / E6).
 * Deterministic ids — same step for any learner → one stored doc.
 */

import { V2PracticeQuestionsModel } from '@/lib/v2/mongo/models';
import {
  PRACTICE_QUESTION_BUILDER_VERSION,
  practiceQuestionId,
} from './id';

export type PracticeQuestionContent = Record<string, unknown>;

export type PracticeQuestionRecord = {
  id: string;
  builder_version: string;
  target_lang: string;
  type: string;
  skill: string;
  tests: {
    item_ids: string[];
    pattern_ids: string[];
    problem_ids: string[];
  };
  lesson_day?: number;
  status: 'active' | 'flagged' | 'retired';
  content: PracticeQuestionContent;
};

export type EnsurePracticeQuestionInput = {
  target_lang?: string;
  type: string;
  skill: string;
  item_ids?: string[];
  pattern_ids?: string[];
  source_id: string;
  lesson_day?: number;
  content: PracticeQuestionContent;
  builder_version?: string;
  /** When the caller already computed the deterministic id (e.g. buildReviewStep). */
  id?: string;
};

export type PracticeQuestionStore = {
  findById: (id: string) => Promise<PracticeQuestionRecord | null>;
  upsert: (doc: PracticeQuestionRecord) => Promise<PracticeQuestionRecord>;
};

const memory = new Map<string, PracticeQuestionRecord>();

export const memoryPracticeQuestionStore: PracticeQuestionStore = {
  async findById(id) {
    return memory.get(id) ?? null;
  },
  async upsert(doc) {
    const existing = memory.get(doc.id);
    if (existing) return existing;
    memory.set(doc.id, doc);
    return doc;
  },
};

/** Test helper. */
export function clearMemoryPracticeQuestions(): void {
  memory.clear();
}

const mongoStore: PracticeQuestionStore = {
  async findById(id) {
    const doc = await V2PracticeQuestionsModel().findOne({ id }).lean();
    if (!doc) return null;
    return {
      id: String(doc.id),
      builder_version: String(doc.builder_version),
      target_lang: String(doc.target_lang),
      type: String(doc.type),
      skill: String(doc.skill),
      tests: {
        item_ids: [...(doc.tests?.item_ids ?? [])],
        pattern_ids: [...(doc.tests?.pattern_ids ?? [])],
        problem_ids: [...(doc.tests?.problem_ids ?? [])],
      },
      lesson_day: doc.lesson_day ?? undefined,
      status: doc.status as PracticeQuestionRecord['status'],
      content: (doc.content ?? {}) as PracticeQuestionContent,
    };
  },
  async upsert(doc) {
    const existing = await V2PracticeQuestionsModel()
      .findOneAndUpdate(
        { id: doc.id },
        { $setOnInsert: doc },
        { upsert: true, new: true, lean: true },
      )
      .lean();
    if (!existing) return doc;
    return {
      id: String(existing.id),
      builder_version: String(existing.builder_version),
      target_lang: String(existing.target_lang),
      type: String(existing.type),
      skill: String(existing.skill),
      tests: {
        item_ids: [...(existing.tests?.item_ids ?? [])],
        pattern_ids: [...(existing.tests?.pattern_ids ?? [])],
        problem_ids: [...(existing.tests?.problem_ids ?? [])],
      },
      lesson_day: existing.lesson_day ?? undefined,
      status: existing.status as PracticeQuestionRecord['status'],
      content: (existing.content ?? {}) as PracticeQuestionContent,
    };
  },
};

let activeStore: PracticeQuestionStore = mongoStore;

export function setPracticeQuestionStore(
  store: PracticeQuestionStore | null,
): void {
  activeStore = store ?? mongoStore;
}

/**
 * Build the deterministic id and upsert once into the shared store.
 * A second call with the same inputs returns the same id / existing doc.
 */
export async function ensurePracticeQuestion(
  input: EnsurePracticeQuestionInput,
): Promise<PracticeQuestionRecord> {
  const builder_version =
    input.builder_version ?? PRACTICE_QUESTION_BUILDER_VERSION;
  const target_lang = input.target_lang ?? 'pt-PT';
  const item_ids = [...(input.item_ids ?? [])].sort();
  const pattern_ids = [...(input.pattern_ids ?? [])].sort();
  const id =
    input.id ??
    practiceQuestionId({
      target_lang,
      type: input.type,
      item_ids,
      pattern_ids,
      source_id: input.source_id,
      builder_version,
    });

  const existing = await activeStore.findById(id);
  if (existing) return existing;

  const doc: PracticeQuestionRecord = {
    id,
    builder_version,
    target_lang,
    type: input.type,
    skill: input.skill,
    tests: {
      item_ids,
      pattern_ids,
      problem_ids: [],
    },
    lesson_day: input.lesson_day,
    status: 'active',
    content: input.content,
  };
  return activeStore.upsert(doc);
}
