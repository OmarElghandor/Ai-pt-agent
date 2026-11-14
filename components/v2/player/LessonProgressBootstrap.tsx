'use client';

import { useEffect, useRef } from 'react';
import { postProgressEvent } from '@/lib/v2/progress/clientEvent';

type StepPresence = { id: string; present: boolean };

/**
 * On day map mount: open lesson progress (skipped steps).
 * Does not auto-navigate — resume is opt-in via the day map CTA.
 */
export function LessonProgressBootstrap({
  day,
  steps,
  dayQuestionsTotal,
  lessonVersion,
}: {
  day: number;
  steps: StepPresence[];
  dayQuestionsTotal: number;
  lessonVersion?: number;
}) {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    postProgressEvent({
      kind: 'lesson_opened',
      day,
      steps,
      day_questions_total: dayQuestionsTotal,
      lesson_version: lessonVersion,
    });
  }, [day, steps, dayQuestionsTotal, lessonVersion]);

  return null;
}
