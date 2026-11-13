import type { Db } from 'mongodb';
import { getAuthDb } from './getAuthDb';
import {
  AUTH_USER_COLLECTIONS,
  USER_ID_FIELD,
  USER_KEYED_V2_COLLECTIONS,
} from './userKeyedCollections';

/** Public decks are shared content — clear creator, do not delete the deck. */
export async function clearCustomDeckCreators(
  db: Db,
  userId: string,
): Promise<number> {
  const result = await db.collection('v2_custom_decks').updateMany(
    { created_by: userId },
    { $set: { created_by: null } },
  );
  return result.modifiedCount ?? 0;
}

/**
 * Delete every v2 document keyed by this user id, then auth rows.
 * Never touches Langify or shared content (lessons, images, packs).
 * Public custom decks stay; their `created_by` is cleared.
 */
export async function deleteV2UserData(userId: string): Promise<{
  deleted: Record<string, number>;
}> {
  if (!userId) throw new Error('userId required');
  const db = await getAuthDb();
  const deleted: Record<string, number> = {};

  for (const name of USER_KEYED_V2_COLLECTIONS) {
    const result = await db.collection(name).deleteMany({ [USER_ID_FIELD]: userId });
    deleted[name] = result.deletedCount ?? 0;
  }

  // Shared custom decks stay public; clear the creator link (12 §2.9 / A5).
  const cleared = await clearCustomDeckCreators(db, userId);
  deleted.v2_custom_decks_cleared_creator = cleared;

  // Auth tables: sessions/accounts by userId; verifications by value/identifier loosely; user by id
  const sessions = await db.collection('v2_auth_sessions').deleteMany({ userId });
  deleted.v2_auth_sessions = sessions.deletedCount ?? 0;

  const accounts = await db.collection('v2_auth_accounts').deleteMany({ userId });
  deleted.v2_auth_accounts = accounts.deletedCount ?? 0;

  // Verifications are not always user-keyed; leave them (expire naturally).
  deleted.v2_auth_verifications = 0;

  const { deleteV2UserDoc } = await import('./v2UserDoc');
  deleted.v2_users = await deleteV2UserDoc(db, userId);

  void AUTH_USER_COLLECTIONS;
  return { deleted };
}
