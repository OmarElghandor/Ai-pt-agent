import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2ItemStateModel, V2SessionModel } from '@/lib/v2/mongo/models';

/** `?day=` seed override. Absent or invalid → null (use the learner's day). */
export function dayOverrideFromSearch(raw: string | null | undefined): number | null {
  if (raw == null || raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

/**
 * Highest day the learner has started: max session day, or max introducedDay.
 * Default 1 when they have neither.
 */
export async function learnerCurrentDay(userId: string): Promise<number> {
  if (!mongoConfigured()) return 1;
  await connectMongo();
  const [session, state] = await Promise.all([
    V2SessionModel()
      .findOne({ user_id: userId, day: { $gte: 1 } })
      .sort({ day: -1 })
      .select('day')
      .lean(),
    V2ItemStateModel()
      .findOne({ user_id: userId, introducedDay: { $gte: 1 } })
      .sort({ introducedDay: -1 })
      .select('introducedDay')
      .lean(),
  ]);
  const days = [session?.day, state?.introducedDay].filter(
    (n): n is number => typeof n === 'number' && n >= 1,
  );
  return days.length ? Math.max(...days) : 1;
}

export async function resolveLearnerDay(
  userId: string,
  override: number | null,
): Promise<number> {
  if (override != null) return override;
  return learnerCurrentDay(userId);
}
