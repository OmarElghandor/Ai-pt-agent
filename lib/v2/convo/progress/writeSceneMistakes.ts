import type { SceneMistakePayload } from '@/lib/v2/answers/payload';
import type { SceneMistakeWriter } from './sceneMistakeWriter';

export type { SceneMistakeWriter } from './sceneMistakeWriter';

/**
 * Production writer for role-play mistakes: same path as POST /api/v2/answers.
 * Never throws to the turn — caller should still wrap if needed.
 */
export function createAnswersSceneMistakeWriter(opts?: {
  timeZone?: string;
}): SceneMistakeWriter {
  return async (payload: SceneMistakePayload) => {
    const { handleAnswerRequest } = await import('@/lib/v2/answers/handle');
    const result = await handleAnswerRequest(payload, {
      timeZone: opts?.timeZone,
    });
    if (result.status !== 200) {
      throw new Error(
        `scene mistake write failed: ${result.error} (${result.status})`,
      );
    }
    return result.body;
  };
}
