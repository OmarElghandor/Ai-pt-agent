import { V2LessonProgressModel } from '@/lib/v2/mongo/models';

/**
 * A Library page taught on `taughtOnDay` unlocks when that day is
 * in_progress or completed for the learner.
 */
export async function isLibraryDayUnlocked(opts: {
  userId: string;
  taughtOnDay: number;
  targetLang?: string;
}): Promise<boolean> {
  if (opts.taughtOnDay <= 0) return false;
  const doc = await V2LessonProgressModel()
    .findOne({
      user_id: opts.userId,
      target_lang: opts.targetLang ?? 'pt-PT',
      day: opts.taughtOnDay,
    })
    .select({ status: 1 })
    .lean();
  if (!doc) return false;
  return doc.status === 'in_progress' || doc.status === 'completed';
}

export async function unlockedLibraryDays(opts: {
  userId: string;
  targetLang?: string;
}): Promise<number[]> {
  const docs = await V2LessonProgressModel()
    .find({
      user_id: opts.userId,
      target_lang: opts.targetLang ?? 'pt-PT',
      status: { $in: ['in_progress', 'completed'] },
    })
    .select({ day: 1 })
    .lean();
  return docs.map((d) => d.day as number).sort((a, b) => a - b);
}
