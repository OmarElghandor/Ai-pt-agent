import mongoose from 'mongoose';

const globalForMongo = globalThis as typeof globalThis & {
  __mongooseConn?: Promise<typeof mongoose> | null;
};

/** Connect once per process. No-op when MONGODB_URI is unset. */
export async function connectMongo(): Promise<typeof mongoose | null> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) return null;

  if (!globalForMongo.__mongooseConn) {
    globalForMongo.__mongooseConn = mongoose.connect(uri, {
      bufferCommands: false,
    });
  }
  return globalForMongo.__mongooseConn;
}

export function mongoConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI?.trim());
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
