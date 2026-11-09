import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2PrepareLockModel } from '@/lib/v2/mongo/models';

const DEFAULT_TTL_MS = 45 * 60 * 1000;

export function prepareLockKey(day: number, targetLang: string): string {
  return `${targetLang}:${day}`;
}

export type PrepareLock = {
  key: string;
  day: number;
  target_lang: string;
  job_id: string;
  expires_at: Date;
};

/** Read a non-expired lock, or null. */
export async function getPrepareLock(
  day: number,
  targetLang: string,
): Promise<PrepareLock | null> {
  if (!mongoConfigured()) return null;
  await connectMongo();
  const key = prepareLockKey(day, targetLang);
  const doc = await V2PrepareLockModel().findOne({ key }).lean();
  if (!doc) return null;
  const expires = new Date(doc.expires_at);
  if (expires.getTime() <= Date.now()) {
    await V2PrepareLockModel().deleteOne({ key });
    return null;
  }
  return {
    key: doc.key,
    day: doc.day,
    target_lang: doc.target_lang,
    job_id: String(doc.job_id),
    expires_at: expires,
  };
}

/**
 * Insert a lock for this day. Returns null if another lock already exists
 * (caller should join that job_id).
 */
export async function tryAcquirePrepareLock(opts: {
  day: number;
  targetLang: string;
  jobId: string;
  ttlMs?: number;
}): Promise<PrepareLock | null> {
  if (!mongoConfigured()) {
    throw new Error('MongoDB not configured');
  }
  await connectMongo();
  const key = prepareLockKey(opts.day, opts.targetLang);
  const existing = await getPrepareLock(opts.day, opts.targetLang);
  if (existing) return null;

  const expires_at = new Date(Date.now() + (opts.ttlMs ?? DEFAULT_TTL_MS));
  try {
    const doc = await V2PrepareLockModel().create({
      key,
      day: opts.day,
      target_lang: opts.targetLang,
      job_id: opts.jobId,
      expires_at,
    });
    return {
      key: doc.key,
      day: doc.day,
      target_lang: doc.target_lang,
      job_id: String(doc.job_id),
      expires_at: doc.expires_at,
    };
  } catch (err) {
    // Race: unique key — join the winner.
    const again = await getPrepareLock(opts.day, opts.targetLang);
    if (again) return null;
    throw err;
  }
}

/** Release the lock when prepare finishes (success or terminal failure). */
export async function releasePrepareLock(
  day: number,
  targetLang: string,
  jobId?: string,
): Promise<void> {
  if (!mongoConfigured()) return;
  await connectMongo();
  const key = prepareLockKey(day, targetLang);
  const filter: Record<string, unknown> = { key };
  if (jobId) filter.job_id = jobId;
  await V2PrepareLockModel().deleteOne(filter);
}
