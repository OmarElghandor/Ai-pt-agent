import { inputHash } from '@/lib/v2/generation/lesson/hash';

/** Bump when code-built question templates change shape (16 §9.1). */
export const PRACTICE_QUESTION_BUILDER_VERSION = '1';

export type PracticeQuestionIdInput = {
  target_lang: string;
  type: string;
  item_ids?: string[];
  pattern_ids?: string[];
  /** Source sentence id, template id, or crafted seed. */
  source_id: string;
  builder_version?: string;
};

/**
 * Deterministic id for a code-built practice question.
 * Same inputs → same id; a new builder_version → a new id.
 */
export function practiceQuestionId(input: PracticeQuestionIdInput): string {
  const builder_version =
    input.builder_version ?? PRACTICE_QUESTION_BUILDER_VERSION;
  const hash = inputHash({
    target_lang: input.target_lang,
    type: input.type,
    item_ids: [...(input.item_ids ?? [])].sort(),
    pattern_ids: [...(input.pattern_ids ?? [])].sort(),
    source_id: input.source_id,
    builder_version,
  });
  return `pq.${hash.slice(0, 24)}`;
}
