import mongoose from 'mongoose';

const globalForMongo = globalThis as typeof globalThis & {
  __mongooseConn?: Promise<typeof mongoose> | null;
};

function mongoUri(): string | undefined {
  const raw = process.env.MONGODB_URI?.trim();
  if (!raw) return undefined;
  return raw.replace(/^['"]|['"]$/g, '');
}

/** Connect once per process. No-op when MONGODB_URI is unset. */
export async function connectMongo(): Promise<typeof mongoose | null> {
  const uri = mongoUri();
  if (!uri) return null;

  if (!globalForMongo.__mongooseConn) {
    globalForMongo.__mongooseConn = mongoose
      .connect(uri, {
        bufferCommands: false,
        // Fail fast in admin/dev instead of hanging ~30s on TLS
        serverSelectionTimeoutMS: 10_000,
        connectTimeoutMS: 10_000,
      })
      .catch((err) => {
        // Allow a later call to retry after Atlas/network is fixed
        globalForMongo.__mongooseConn = null;
        throw err;
      });
  }
  return globalForMongo.__mongooseConn;
}

/** Drop the cached connection promise (e.g. after a known bad connect). */
export function resetMongoConnection(): void {
  globalForMongo.__mongooseConn = null;
}

export function mongoConfigured(): boolean {
  return Boolean(mongoUri());
}

export function isObjectIdString(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[a-fA-F0-9]{24}$/.test(value);
}

/** @deprecated use getCurrentUserId from lib/auth/currentUser */
export function resolveProgressUserId(learnerId: string): string | null {
  if (isObjectIdString(learnerId)) return learnerId;
  const dev =
    process.env.DEV_LANGIFY_USER_ID?.trim() ||
    process.env.DEV_USER_PROGRESS_ID?.trim();
  if (dev && isObjectIdString(dev)) return dev;
  return null;
}
