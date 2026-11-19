import { V2LessonProgressModel } from '@/lib/v2/mongo/models';
import type { PathDayRow, PathDayStatus } from '@/lib/v2/path';
import { buildDaySteps } from '@/lib/v2/progress/daySteps';
import type { LessonProgressRecord } from '@/lib/v2/progress/events/store';
import { buildStepView } from '@/lib/v2/progress/stepView';
import { userLocalDate } from '@/lib/v2/progress/userLocalDate';

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
  /** Counted stations done/total — null unless in_progress (or unreadable). */
  steps_done: number | null;
  steps_total: number | null;
};

function toProgressRecord(
  doc: Record<string, unknown>,
): Pick<LessonProgressRecord, 'status' | 'steps'> {
  const steps = Array.isArray(doc.steps)
    ? (doc.steps as Array<{ id: string; status: string; done_at?: Date | null }>).map(
        (s) => ({
          id: s.id,
          status: s.status as LessonProgressRecord['steps'][number]['status'],
          done_at: s.done_at ? new Date(s.done_at) : null,
        }),
      )
    : [];
  return {
    status: (doc.status as LessonProgressRecord['status']) ?? 'locked',
    steps,
  };
}

/**
 * Merge curriculum/content path rows with v2_lesson_progress for the learner.
 * Fresh user: day 1 available (if content exists), rest locked.
 * In-progress days get counted station done/total for the path tile.
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

  return Promise.all(
    opts.days.map(async (row) => {
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

      let steps_done: number | null = null;
      let steps_total: number | null = null;
      if (learner_status === 'in_progress' && doc) {
        try {
          const shared = await buildDaySteps({ day: row.day });
          const view = buildStepView(
            toProgressRecord(doc as unknown as Record<string, unknown>),
            shared?.steps ?? [],
          );
          steps_done = view.done;
          steps_total = view.total;
        } catch {
          /* tile stays without x/y */
        }
      }

      return {
        ...row,
        status,
        href,
        learner_status,
        opens_on,
        practised,
        bakra,
        steps_done,
        steps_total,
      };
    }),
  );
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

/**
 * Pure tile status for tests: done only from learner_status completed.
 * Practice / sessionStorage must never mark a day done.
 */
export function pathTileStatus(
  row: Pick<LearnerPathDay, 'learner_status' | 'bakra' | 'href' | 'status'>,
  opts?: { isCurrent?: boolean },
): 'done' | 'current' | 'available' | 'locked' | 'bakra' {
  if (row.learner_status === 'completed') return 'done';
  if (row.bakra || row.learner_status === 'scheduled') return 'bakra';
  if (
    row.learner_status === 'locked' ||
    row.status === 'locked' ||
    !row.href
  ) {
    return 'locked';
  }
  if (opts?.isCurrent) return 'current';
  if (
    row.learner_status === 'available' ||
    row.learner_status === 'in_progress'
  ) {
    return 'available';
  }
  return 'locked';
}
