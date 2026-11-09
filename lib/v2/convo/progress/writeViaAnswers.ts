import { handleAnswerRequest } from '@/lib/v2/answers/handle';
import type { ConvoAnswerPayload } from '@/lib/v2/answers/payload';
import type { AnswerVerdict } from '@/lib/v2/answers/evaluate';
import type { ConvoProgressWriter } from './mirror';

/**
 * Production writer: same path as POST /api/v2/answers.
 */
export function createAnswersConvoProgressWriter(opts?: {
  timeZone?: string;
}): ConvoProgressWriter {
  return async (payload: ConvoAnswerPayload) => {
    const result = await handleAnswerRequest(payload, {
      timeZone: opts?.timeZone,
    });
    if (result.status !== 200) {
      throw new Error(
        `convo progress write failed: ${result.error} (${result.status})`,
      );
    }
    return result.body as AnswerVerdict;
  };
}
