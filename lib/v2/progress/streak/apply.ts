import { getAuthDb } from '@/lib/v2/auth/getAuthDb';
import { findV2UserDoc, updateV2UserDoc } from '@/lib/v2/auth/v2UserDoc';
import { normalizeStreak } from '@/lib/v2/auth/types';
import { applyStreakActivity } from '@/lib/v2/progress/streak/compute';
import { V2ActivityDayModel } from '@/lib/v2/mongo/models';

/** Persist streak when an activity day first counts. */
export async function onStreakActivity(opts: {
  userId: string;
  localDate: string;
  timezone: string;
}): Promise<void> {
  const act = await V2ActivityDayModel()
    .findOne({ user_id: opts.userId, local_date: opts.localDate })
    .lean();
  if (!act?.counts_for_streak) return;

  const db = await getAuthDb();
  const doc = await findV2UserDoc(db, opts.userId);
  const prev = normalizeStreak(doc?.streak);
  if (prev.last_active_day === opts.localDate) return;

  const next = applyStreakActivity(prev, {
    localDate: opts.localDate,
    timezone: opts.timezone,
  });
  await updateV2UserDoc(db, opts.userId, { streak: next });
}
