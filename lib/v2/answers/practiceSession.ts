import { connectMongo } from '@/lib/mongo';
import { V2SessionModel } from '@/lib/v2/mongo/models';

export type PracticeSessionDoc = {
  _id: string;
  user_id: string;
  day: number;
  status: 'open' | 'done';
  beat_attempts: Record<string, number>;
  skill_counts: Record<
    string,
    { correct: number; total: number }
  >;
};

export async function getOrCreatePracticeSession(opts: {
  userId: string;
  day: number;
  sessionId?: string;
  localDate: string;
  tz?: string;
}): Promise<{ id: string; beat_attempts: Record<string, number>; skill_counts: PracticeSessionDoc['skill_counts'] }> {
  await connectMongo();
  const Model = V2SessionModel();

  if (opts.sessionId) {
    const existing = await Model.findById(opts.sessionId).lean();
    if (
      existing &&
      existing.user_id === opts.userId &&
      existing.kind === 'practice'
    ) {
      return {
        id: String(existing._id),
        beat_attempts:
          (existing.beat_attempts as Record<string, number>) ?? {},
        skill_counts:
          (existing.skill_counts as PracticeSessionDoc['skill_counts']) ?? {},
      };
    }
  }

  const open = await Model.findOne({
    user_id: opts.userId,
    kind: 'practice',
    day: opts.day,
    status: 'open',
  }).lean();
  if (open) {
    return {
      id: String(open._id),
      beat_attempts: (open.beat_attempts as Record<string, number>) ?? {},
      skill_counts:
        (open.skill_counts as PracticeSessionDoc['skill_counts']) ?? {},
    };
  }

  const created = await Model.create({
    user_id: opts.userId,
    kind: 'practice',
    day: opts.day,
    local_date: opts.localDate,
    status: 'open',
    beat_attempts: {},
    skill_counts: {},
    tz: opts.tz,
  });
  return {
    id: String(created._id),
    beat_attempts: {},
    skill_counts: {},
  };
}

/** Increment attempt for beat; returns the new attempt number (capped display at 2). */
export async function bumpBeatAttempt(
  sessionId: string,
  beatId: string,
): Promise<1 | 2> {
  await connectMongo();
  const Model = V2SessionModel();
  const doc = await Model.findById(sessionId);
  if (!doc) return 1;
  const attempts = {
    ...((doc.beat_attempts as Record<string, number>) ?? {}),
  };
  const next = Math.min(2, (attempts[beatId] ?? 0) + 1) as 1 | 2;
  attempts[beatId] = next;
  doc.beat_attempts = attempts;
  await doc.save();
  return next;
}

export async function recordSkillResult(
  sessionId: string,
  skill: string,
  correct: boolean,
): Promise<PracticeSessionDoc['skill_counts']> {
  await connectMongo();
  const Model = V2SessionModel();
  const doc = await Model.findById(sessionId);
  if (!doc) return {};
  const counts = {
    ...((doc.skill_counts as PracticeSessionDoc['skill_counts']) ?? {}),
  };
  const cur = counts[skill] ?? { correct: 0, total: 0 };
  counts[skill] = {
    correct: cur.correct + (correct ? 1 : 0),
    total: cur.total + 1,
  };
  doc.skill_counts = counts;
  await doc.save();
  return counts;
}

export async function completePracticeSession(
  sessionId: string,
): Promise<void> {
  await connectMongo();
  await V2SessionModel().updateOne(
    { _id: sessionId },
    { $set: { status: 'done' } },
  );
}
