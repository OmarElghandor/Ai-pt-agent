import type { Db } from 'mongodb';
import { MongoClient } from 'mongodb';

const globalForAuthMongo = globalThis as typeof globalThis & {
  __v2AuthMongoClient?: MongoClient;
};

/** Return the Better Auth Mongo Db (same process singleton as lib/v2/auth). */
export async function getAuthDb(): Promise<Db> {
  const existing = globalForAuthMongo.__v2AuthMongoClient;
  if (existing) return existing.db();

  const uri = process.env.MONGODB_URI?.trim().replace(/^['"]|['"]$/g, '');
  if (!uri) throw new Error('MONGODB_URI missing');
  const client = new MongoClient(uri);
  await client.connect();
  globalForAuthMongo.__v2AuthMongoClient = client;
  return client.db();
}
