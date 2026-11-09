import { ObjectId, type Db, type Document, type WithId } from 'mongodb';

const USERS = 'v2_users' as const;

/**
 * Match a v2_users doc whether Better Auth stored the key as `_id` (Google)
 * or as a top-level `id` string (dev-signin).
 */
export function userIdFilter(userId: string): Document {
  if (!userId) return { _id: null };
  const or: Document[] = [{ id: userId }];
  if (ObjectId.isValid(userId) && String(new ObjectId(userId)) === userId) {
    or.push({ _id: new ObjectId(userId) });
  }
  // String `_id` fallback (some inserts store hex as string).
  or.push({ _id: userId });
  return { $or: or };
}

export async function findV2UserDoc(
  db: Db,
  userId: string,
): Promise<WithId<Document> | null> {
  if (!userId) return null;
  return db.collection(USERS).findOne(userIdFilter(userId));
}

export async function updateV2UserDoc(
  db: Db,
  userId: string,
  setDoc: Record<string, unknown>,
): Promise<{ matchedCount: number; modifiedCount: number }> {
  if (!userId || Object.keys(setDoc).length === 0) {
    return { matchedCount: 0, modifiedCount: 0 };
  }
  const result = await db
    .collection(USERS)
    .updateOne(userIdFilter(userId), { $set: setDoc });
  return {
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
  };
}

export async function deleteV2UserDoc(
  db: Db,
  userId: string,
): Promise<number> {
  if (!userId) return 0;
  const result = await db.collection(USERS).deleteMany(userIdFilter(userId));
  return result.deletedCount ?? 0;
}
