/**
 * prepare_day → the staged job graph (items → story → outline → pages →
 * questions → real_world → micro / daily_use → critic → continuity →
 * assemble → lang_check), the same pipeline as the admin "ولّد" button.
 *
 * Before this, prepare_day called the legacy single-process orchestrator
 * (`lesson/run.ts`), so bulk "جهّز الأيام الجاية" and on-demand learner days
 * skipped the story, items, real_world, micro, critic and lang_check stages.
 */
import type { V2JobKind } from '@/lib/v2/mongo/models';
import {
  enqueueGenerateLesson,
  listJobsForVersion,
  runWorkerUntilIdle,
  summarizeJobGraph,
} from '../jobs';
import { getLessonVersion, type SavedLesson } from '../lesson/save';

/** Text stages only — image jobs stay queued for the admin images button. */
export const LESSON_TEXT_KINDS: V2JobKind[] = [
  'items',
  'story',
  'outline',
  'page',
  'critic',
  'questions',
  'micro',
  'daily_use',
  'real_world',
  'continuity',
  'assemble',
  'lang_check',
];

const TEXT_KIND_SET = new Set<string>(LESSON_TEXT_KINDS);

/** Max time prepare waits for one lesson graph (env override). */
export function lessonDagWaitMs(): number {
  const n = Number(process.env.V2_PREPARE_LESSON_WAIT_MS);
  return Number.isFinite(n) && n > 0 ? n : 15 * 60 * 1000;
}

export type LessonDagStatus = {
  /** No text jobs for this version (legacy draft) — treat as complete. */
  legacy: boolean;
  complete: boolean;
  status: ReturnType<typeof summarizeJobGraph>['status'];
};

export async function lessonDagStatus(opts: {
  day: number;
  version: number;
  targetLang: string;
}): Promise<LessonDagStatus> {
  const jobs = (
    await listJobsForVersion(opts.day, opts.version, opts.targetLang)
  ).filter((j) => TEXT_KIND_SET.has(String(j.kind)));
  if (jobs.length === 0) {
    return { legacy: true, complete: true, status: 'done' };
  }
  const summary = summarizeJobGraph(jobs);
  return {
    legacy: false,
    complete: summary.status === 'done' && summary.text_ready,
    status: summary.status,
  };
}

/** Drain this lesson version's text jobs in-process (no other day's jobs). */
async function drainLessonVersion(opts: {
  day: number;
  version: number;
  targetLang: string;
  deadlineMs: number;
}): Promise<void> {
  const workerId = `prepare-${process.pid}-${opts.day}-${Date.now().toString(36)}`;
  await runWorkerUntilIdle(workerId, {
    maxEmptyRounds: 3,
    idleMs: 1500,
    deadlineMs: opts.deadlineMs,
    filter: {
      day: opts.day,
      version: opts.version,
      targetLang: opts.targetLang,
      kinds: LESSON_TEXT_KINDS,
    },
  });
}

/** New draft through the job graph; waits until assemble + lang_check finish. */
export async function generateLessonViaDag(opts: {
  day: number;
  targetLang?: string;
  deadlineMs?: number;
}): Promise<{ saved: SavedLesson; complete: boolean }> {
  const targetLang = opts.targetLang ?? 'pt-PT';
  const enqueued = await enqueueGenerateLesson({ day: opts.day, targetLang });
  await drainLessonVersion({
    day: opts.day,
    version: enqueued.version,
    targetLang,
    deadlineMs: opts.deadlineMs ?? lessonDagWaitMs(),
  });
  const status = await lessonDagStatus({
    day: opts.day,
    version: enqueued.version,
    targetLang,
  });
  const saved = await getLessonVersion(opts.day, enqueued.version, targetLang);
  if (!saved) {
    throw new Error(`lesson draft missing after graph: day ${opts.day} v${enqueued.version}`);
  }
  return { saved, complete: status.complete };
}

/**
 * Existing draft: if it came from the job graph and isn't finished, resume
 * its queued jobs once, then report whether it's complete. Legacy drafts
 * (no jobs) count as complete so old drafts keep their current behaviour.
 */
export async function ensureLessonDraftComplete(opts: {
  day: number;
  version: number;
  targetLang: string;
  deadlineMs?: number;
}): Promise<boolean> {
  const first = await lessonDagStatus(opts);
  if (first.complete) return true;
  if (first.status === 'failed' || first.status === 'stale') return false;
  await drainLessonVersion({
    ...opts,
    deadlineMs: opts.deadlineMs ?? lessonDagWaitMs(),
  });
  return (await lessonDagStatus(opts)).complete;
}
