import type { DayStep } from '@/lib/v2/progress/daySteps';
import type { LessonProgressRecord } from '@/lib/v2/progress/events/store';

export type StepViewStep = {
  id: string;
  title: string;
  href: string | null;
  kind: DayStep['kind'];
};

export type StepView = {
  done: number;
  total: number;
  nextStep: StepViewStep | null;
  lastDoneStep: StepViewStep | null;
  started: boolean;
  lastStepDoneAt: Date | null;
};

type ProgressStep = LessonProgressRecord['steps'][number];

function bySharedId(shared: DayStep[]): Map<string, DayStep> {
  return new Map(shared.map((s) => [s.id, s]));
}

/**
 * Order for counting / next-step: saved lesson_opened order wins;
 * if the doc has no steps yet, fall back to the shared list order.
 */
function orderedIds(
  progress: Pick<LessonProgressRecord, 'steps'> | null | undefined,
  shared: DayStep[],
): string[] {
  if (progress?.steps?.length) return progress.steps.map((s) => s.id);
  return shared.map((s) => s.id);
}

function toViewStep(step: DayStep): StepViewStep {
  return {
    id: step.id,
    title: step.title,
    href: step.href,
    kind: step.kind,
  };
}

/**
 * Pure view over a lesson progress doc + the shared day-step list.
 * Counted stations = present && not practice (and not skipped on the doc).
 * Next step = first counted station in order with status not_started.
 * Completed days have no next step.
 */
export function buildStepView(
  progress:
    | Pick<LessonProgressRecord, 'status' | 'steps'>
    | null
    | undefined,
  sharedSteps: DayStep[],
): StepView {
  const sharedById = bySharedId(sharedSteps);
  const progressById = new Map(
    (progress?.steps ?? []).map((s) => [s.id, s] as const),
  );
  const ids = orderedIds(progress, sharedSteps);

  const counted: Array<{ id: string; shared: DayStep; status: ProgressStep['status'] }> =
    [];

  for (const id of ids) {
    const shared = sharedById.get(id);
    if (!shared?.counted) continue;
    const saved = progressById.get(id);
    const status = saved?.status ?? 'not_started';
    if (status === 'skipped') continue;
    counted.push({ id, shared, status });
  }

  // Also include counted shared steps that never made it into saved order
  // (e.g. partial step_done before lesson_opened) — only when we already
  // had a saved order that omitted them.
  if (progress?.steps?.length) {
    const seen = new Set(ids);
    for (const shared of sharedSteps) {
      if (!shared.counted || seen.has(shared.id)) continue;
      const saved = progressById.get(shared.id);
      if (saved?.status === 'skipped') continue;
      counted.push({
        id: shared.id,
        shared,
        status: saved?.status ?? 'not_started',
      });
    }
  }

  const doneSteps = counted.filter((c) => c.status === 'done');
  const done = doneSteps.length;
  const total = counted.length;
  const started = done > 0;

  let lastDoneStep: StepViewStep | null = null;
  let lastStepDoneAt: Date | null = null;
  for (const id of ids) {
    const saved = progressById.get(id);
    if (saved?.status !== 'done') continue;
    const shared = sharedById.get(id);
    if (!shared) continue;
    lastDoneStep = toViewStep(shared);
    if (saved.done_at) lastStepDoneAt = saved.done_at;
  }

  if (progress?.status === 'completed') {
    return {
      done,
      total,
      nextStep: null,
      lastDoneStep,
      started,
      lastStepDoneAt,
    };
  }

  const next = counted.find((c) => c.status === 'not_started');
  return {
    done,
    total,
    nextStep: next ? toViewStep(next.shared) : null,
    lastDoneStep,
    started,
    lastStepDoneAt,
  };
}
