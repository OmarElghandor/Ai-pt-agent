import {
  createMongoProgressStore,
  handleProgressEvent,
} from '@/lib/v2/progress/events';
import type { LessonProgressRecord } from '@/lib/v2/progress/events/store';
import { randomUUID } from 'node:crypto';

export type DayStepPresence = { id: string; present: boolean };

/**
 * Record lesson open (skipped steps, totals) and return progress for resume.
 */
export async function openLessonProgress(opts: {
  userId: string;
  timezone?: string | null;
  day: number;
  targetLang?: string;
  lessonVersion?: number;
  steps: DayStepPresence[];
  dayQuestionsTotal: number;
}): Promise<LessonProgressRecord | null> {
  const store = createMongoProgressStore();
  const result = await handleProgressEvent(
    {
      kind: 'lesson_opened',
      event_id: randomUUID(),
      target_lang: opts.targetLang ?? 'pt-PT',
      day: opts.day,
      lesson_version: opts.lessonVersion,
      steps: opts.steps,
      day_questions_total: opts.dayQuestionsTotal,
    },
    {
      userId: opts.userId,
      timezone: opts.timezone,
      store,
    },
  );
  return result.lesson ?? null;
}

export function resumeHref(
  day: number,
  resume: LessonProgressRecord['resume'],
  status: LessonProgressRecord['status'],
): string | null {
  if (status !== 'in_progress' || !resume?.step_id) return null;
  const id = resume.step_id;
  if (id === 'day_questions') return `/day/${day}/questions`;
  if (id === 'find_image') return `/day/${day}/find-image`;
  if (id === 'practice') return `/talk/lesson/${day}`;
  return `/day/${day}/page/${id}`;
}
