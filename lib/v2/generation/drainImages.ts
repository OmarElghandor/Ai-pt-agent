import { runWorkerUntilIdle } from '@/lib/v2/generation/jobs';

const IMAGE_DRAIN_KINDS = ['image_specs', 'image'] as const;

/** Drain image jobs for a day (admin fire-and-forget / scripts). */
export async function drainLessonImageJobs(opts: {
  day: number;
  targetLang?: string;
  workerId?: string;
  deadlineMs?: number;
  /** Defaults to image_specs + image (lesson). Deck jobs are image-only. */
  kinds?: Array<'image_specs' | 'image'>;
}): Promise<number> {
  const workerId =
    opts.workerId ??
    `admin-img-${process.pid}-${Date.now().toString(36)}`;
  const kinds = opts.kinds?.length ? opts.kinds : [...IMAGE_DRAIN_KINDS];
  return runWorkerUntilIdle(workerId, {
    maxEmptyRounds: 8,
    idleMs: 2500,
    deadlineMs: opts.deadlineMs ?? 280_000,
    concurrency: 2,
    filter: {
      day: opts.day,
      targetLang: opts.targetLang,
      kinds,
    },
  });
}

/**
 * Drain custom/official deck image jobs (`day: 0`, kind `image` only).
 * Lesson routes already call drainLessonImageJobs; deck enqueue APIs need this.
 */
export async function drainDeckImageJobs(opts?: {
  workerId?: string;
  deadlineMs?: number;
}): Promise<number> {
  return drainLessonImageJobs({
    day: 0,
    kinds: ['image'],
    workerId: opts?.workerId ?? `admin-deck-img-${process.pid}-${Date.now().toString(36)}`,
    deadlineMs: opts?.deadlineMs,
  });
}
