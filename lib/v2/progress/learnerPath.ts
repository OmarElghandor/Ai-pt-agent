import { V2LessonProgressModel } from '@/lib/v2/mongo/models';
import type { PathDayRow, PathDayStatus } from '@/lib/v2/path';
import {
  nextLocalDate,
  userLocalDate,
} from '@/lib/v2/progress/userLocalDate';
import { createEmptyLesson } from '@/lib/v2/progress/events/store';

export type LearnerPathStatus =
  | 'locked'
  | 'scheduled'
  | 'available'
  | 'in_progress'
  | 'completed';

export type LearnerPathDay = PathDayRow & {
  learner_status: LearnerPathStatus;
  opens_on: string | null;
  practised: boolean;
  /** Content may exist but learner hasn't unlocked yet. */
  bakra: boolean;
};

/**
 * Merge curriculum/content path rows with v2_lesson_progress for the learner.
 * Fresh user: day 1 available (if content exists), rest locked.
 */
export async function mergeLearnerPath(opts: {
  userId: string;
  timezone?: string | null;
  days: PathDayRow[];
  targetLang?: string;
}): Promise<LearnerPathDay[]> {
  const target_lang = opts.targetLang ?? 'pt-PT';
  const today = userLocalDate(opts.timezone);
  const docs = await V2LessonProgressModel()
    .find({ user_id: opts.userId, target_lang })
    .lean();
  const byDay = new Map(docs.map((d) => [d.day as number, d]));

  // Ensure day 1 seed exists conceptually even without a doc.
  return opts.days.map((row) => {
    const doc = byDay.get(row.day);
    let learner_status: LearnerPathStatus;
    let opens_on: string | null = null;

    if (doc) {
      learner_status = doc.status as LearnerPathStatus;
      opens_on = (doc.opens_on as string | null) ?? null;
      if (
        learner_status === 'scheduled' &&
        opens_on &&
        opens_on <= today
      ) {
        learner_status = 'available';
        opens_on = null;
      }
    } else if (row.day === 1 && row.href) {
      learner_status = 'available';
    } else {
      learner_status = 'locked';
    }

    const contentLocked = !row.href || row.status === 'locked';
    const practised = Boolean(
      doc?.practice &&
        typeof (doc.practice as { times?: number }).times === 'number' &&
        (doc.practice as { times: number }).times > 0,
    );

    const bakra = learner_status === 'scheduled';
    const href =
      contentLocked ||
      learner_status === 'locked' ||
      learner_status === 'scheduled'
        ? null
        : row.href;

    // Keep content status for admin/dev; learner gate is learner_status.
    const status: PathDayStatus =
      learner_status === 'completed'
        ? row.status === 'locked'
          ? 'locked'
          : row.status
        : learner_status === 'locked' || learner_status === 'scheduled'
          ? 'locked'
          : row.status === 'locked'
            ? 'locked'
            : row.status;

    void createEmptyLesson;
    void nextLocalDate;

    return {
      ...row,
      status,
      href,
      learner_status,
      opens_on,
      practised,
      bakra,
    };
  });
}

export function resolveLearnerCurrentDay(
  days: LearnerPathDay[],
): number | null {
  const open = days.find(
    (d) =>
      d.learner_status === 'available' || d.learner_status === 'in_progress',
  );
  if (open) return open.day;
  const bakra = days.find((d) => d.learner_status === 'scheduled');
  return bakra?.day ?? null;
}
