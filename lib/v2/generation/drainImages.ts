import { runWorkerUntilIdle } from '@/lib/v2/generation/jobs';

const IMAGE_DRAIN_KINDS = ['image_specs', 'image'] as const;

/** Drain image jobs for a day (admin fire-and-forget / scripts). */
export async function drainLessonImageJobs(opts: {
  day: number;
  targetLang?: string;
  workerId?: string;
  deadlineMs?: number;
}): Promise<number> {
  const workerId =
    opts.workerId ??
    `admin-img-${process.pid}-${Date.now().toString(36)}`;
  return runWorkerUntilIdle(workerId, {
    maxEmptyRounds: 8,
    idleMs: 2500,
    deadlineMs: opts.deadlineMs ?? 280_000,
    concurrency: 2,
    filter: {
      day: opts.day,
      targetLang: opts.targetLang,
      kinds: [...IMAGE_DRAIN_KINDS],
    },
  });
}
