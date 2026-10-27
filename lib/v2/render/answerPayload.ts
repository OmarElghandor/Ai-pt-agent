import {
  parseAnswerPayload as parseV2AnswerPayload,
  type AnswerPayload as V2AnswerPayload,
  type PageAskPayload,
  type PageQuizPayload,
} from '@/lib/v2/answers/payload';

export type { PageAskPayload, PageQuizPayload };

/** @deprecated Prefer AnswerPayload from lib/v2/answers (requires answer_id). */
export type PageAnswerPayload = PageAskPayload | PageQuizPayload;

/**
 * Parse page ask/quiz payloads. Requires answer_id (uuid) as of Phase 4.
 */
export function parsePageAnswerPayload(
  body: unknown,
): PageAnswerPayload | null {
  const parsed = parseV2AnswerPayload(body);
  if (!parsed) return null;
  if (parsed.kind === 'page_ask' || parsed.kind === 'page_quiz') return parsed;
  return null;
}

export type AnswerPayload = V2AnswerPayload;
export { parseV2AnswerPayload as parseAnswerPayload };
