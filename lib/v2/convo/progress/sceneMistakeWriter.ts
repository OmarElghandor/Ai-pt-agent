import type { SceneMistakePayload } from '@/lib/v2/answers/payload';

/** Writer for role-play mistake pairs (batch-rp-5). */
export type SceneMistakeWriter = (
  payload: SceneMistakePayload,
) => Promise<{ ok?: boolean; duplicate?: boolean } | unknown>;
