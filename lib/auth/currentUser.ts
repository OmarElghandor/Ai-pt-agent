import { isObjectIdString } from '@/lib/mongo';

/**
 * Single place for "current Langify user id".
 * Dev: DEV_LANGIFY_USER_ID (or legacy DEV_USER_PROGRESS_ID) / ObjectId session.
 * Later: verify Langify JWT here only.
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
