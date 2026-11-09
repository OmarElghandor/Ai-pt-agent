/**
 * One-time Langify link on first Google sign-in.
 * Never writes Langify collections. Never blocks sign-in on failure.
 */
import { findLangifyUserIdByEmailOrThrow } from '@/lib/langifyRead';

export type LinkLangifyInput = {
  userId: string;
  email: string;
  emailVerified: boolean;
  existingLangifyId: string | null;
};

/**
 * If email is verified and not yet linked, look up Langify users by email
 * and store langify_user_id on the v2 user. Safe to call on every sign-in:
 * no-ops when already linked or unverified.
 */
export async function tryLinkLangifyUser(input: LinkLangifyInput): Promise<{
  linked: boolean;
  langifyUserId: string | null;
  skippedReason?: string;
}> {
  if (input.existingLangifyId) {
    return { linked: false, langifyUserId: input.existingLangifyId, skippedReason: 'already_linked' };
  }
  if (!input.emailVerified) {
    return { linked: false, langifyUserId: null, skippedReason: 'email_unverified' };
  }
  if (!input.email?.trim()) {
    return { linked: false, langifyUserId: null, skippedReason: 'no_email' };
  }

  let langifyUserId: string | null = null;
  try {
    langifyUserId = await findLangifyUserIdByEmailOrThrow(input.email);
  } catch (err) {
    console.error('[v2/auth/link] Langify read failed; will retry next sign-in', err);
    return { linked: false, langifyUserId: null, skippedReason: 'langify_down' };
  }

  if (!langifyUserId) {
    return { linked: false, langifyUserId: null, skippedReason: 'no_match' };
  }

  try {
    const { getAuthDb } = await import('./getAuthDb');
    const { findV2UserDoc, userIdFilter } = await import('./v2UserDoc');
    const db = await getAuthDb();
    const write = await db.collection('v2_users').updateOne(
      {
        $and: [
          userIdFilter(input.userId),
          {
            $or: [
              { langify_user_id: null },
              { langify_user_id: { $exists: false } },
              { langify_user_id: '' },
            ],
          },
        ],
      },
      { $set: { langify_user_id: langifyUserId } },
    );
    if (write.matchedCount === 0) {
      const again = await findV2UserDoc(db, input.userId);
      const againId = again?.langify_user_id
        ? String(again.langify_user_id)
        : null;
      if (againId) {
        return {
          linked: false,
          langifyUserId: againId,
          skippedReason: 'already_linked',
        };
      }
      return { linked: false, langifyUserId, skippedReason: 'store_failed' };
    }
    return { linked: true, langifyUserId };
  } catch (err) {
    console.error('[v2/auth/link] failed to store langify_user_id', err);
    return { linked: false, langifyUserId, skippedReason: 'store_failed' };
  }
}
