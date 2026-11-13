'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { postProgressEvent } from '@/lib/v2/progress/clientEvent';

type StepPresence = { id: string; present: boolean };

/**
 * On day map mount: open lesson progress (skipped steps) and jump to resume.
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
  const router = useRouter();
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
    void fetch(`/api/v2/progress/lesson/${day}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { resume_href?: string | null; status?: string } | null) => {
        if (data?.status === 'in_progress' && data.resume_href) {
          router.replace(data.resume_href);
        }
      })
      .catch(() => {});
  }, [day, steps, dayQuestionsTotal, lessonVersion, router]);

  return null;
}
