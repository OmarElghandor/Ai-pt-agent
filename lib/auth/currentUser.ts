import { isObjectIdString } from '@/lib/mongo';

/**
 * Legacy Langify id helper for practice_* / langifyRead only.
 * v2 learner routes must use getCurrentV2User / getCurrentV2UserId from
 * `lib/v2/auth/session` (session cookie). Never trust a client-supplied user id.
 *
 * Dev fallback: DEV_LANGIFY_USER_ID for legacy paths only.
 */
export function getCurrentUserId(sessionHint?: string | null): string | null {
  if (sessionHint && isObjectIdString(sessionHint)) return sessionHint;

  const fromQueryEnv =
    process.env.DEV_LANGIFY_USER_ID?.trim() ||
    process.env.DEV_USER_PROGRESS_ID?.trim();
  if (fromQueryEnv && isObjectIdString(fromQueryEnv)) return fromQueryEnv;

  return null;
}

/** @deprecated use getCurrentUserId */
export function resolveProgressUserId(learnerId: string): string | null {
  return getCurrentUserId(learnerId);
}
