/**
 * Native MongoDB client for Better Auth (same MONGODB_URI / database as Mongoose).
 * Better Auth's adapter needs the driver `Db`, not a Mongoose connection.
 */
import { MongoClient, type Db } from 'mongodb';

const globalForAuthMongo = globalThis as typeof globalThis & {
  __v2AuthMongo?: { client: MongoClient; db: Db; uri: string };
};

export async function getAuthMongoDb(uri: string): Promise<{ client: MongoClient; db: Db }> {
  const cached = globalForAuthMongo.__v2AuthMongo;
  if (cached && cached.uri === uri) {
    return { client: cached.client, db: cached.db };
  }

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
  });
  await client.connect();
  const db = client.db();
  globalForAuthMongo.__v2AuthMongo = { client, db, uri };
  return { client, db };
}
