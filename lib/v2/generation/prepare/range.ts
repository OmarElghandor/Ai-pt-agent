import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2ItemStateModel, V2JobModel } from '@/lib/v2/mongo/models';
import { enqueueOrJoinPrepareDay } from './enqueue';
import { checkPrepareCostCap } from './costCap';
import { getDayReadiness } from './readiness';

export type PrepareRangeProgress = {
  run_id: string;
  status: 'running' | 'stopped' | 'done' | 'capped';
  from: number;
  to: number;
  concurrency: number;
  current: number[];
  done_days: number[];
  needs_review_days: number[];
  failed_days: number[];
  skipped_days: number[];
  cost_usd: number;
  stop_requested: boolean;
  message?: string;
};

const runs = new Map<string, PrepareRangeProgress>();

export function getPrepareRangeProgress(
  runId: string,
): PrepareRangeProgress | null {
  return runs.get(runId) ?? null;
}

export function requestPrepareRangeStop(runId: string): boolean {
  const run = runs.get(runId);
  if (!run || run.status !== 'running') return false;
  run.stop_requested = true;
  return true;
}

export function listActivePrepareRanges(): PrepareRangeProgress[] {
  return [...runs.values()].filter((r) => r.status === 'running');
}

async function sumJobCost(jobIds: string[]): Promise<number> {
  if (!jobIds.length || !mongoConfigured()) return 0;
  await connectMongo();
  const docs = await V2JobModel()
    .find({ _id: { $in: jobIds } })
    .select({ usd_estimate: 1 })
    .lean();
  return docs.reduce((s, d) => s + (Number(d.usd_estimate ?? 0) || 0), 0);
}

/**
 * Enqueue prepare_day for each day in [from, to] with limited concurrency.
 * Honors stop flag and cost caps.
 */
/** Create a running progress entry before the async drain starts. */
export function beginPrepareRange(opts: {
  from: number;
  to: number;
  concurrency?: number;
  runId?: string;
}): PrepareRangeProgress {
  const from = Math.min(opts.from, opts.to);
  const to = Math.max(opts.from, opts.to);
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 2, 4));
  const run_id =
    opts.runId ?? `range-${from}-${to}-${Date.now().toString(36)}`;
  const progress: PrepareRangeProgress = {
    run_id,
    status: 'running',
    from,
    to,
    concurrency,
    current: [],
    done_days: [],
    needs_review_days: [],
    failed_days: [],
    skipped_days: [],
    cost_usd: 0,
    stop_requested: false,
  };
  runs.set(run_id, progress);
  return progress;
}

export async function runPrepareDayRange(opts: {
  from: number;
  to: number;
  concurrency?: number;
  targetLang?: string;
  runId?: string;
}): Promise<PrepareRangeProgress> {
  const from = Math.min(opts.from, opts.to);
  const to = Math.max(opts.from, opts.to);
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 2, 4));
  const targetLang = opts.targetLang ?? 'pt-PT';
  const seeded =
    (opts.runId ? runs.get(opts.runId) : null) ??
    beginPrepareRange({
      from,
      to,
      concurrency,
      runId: opts.runId,
    });
  const progress = seeded;
  const run_id = progress.run_id;

  const days: number[] = [];
  for (let d = from; d <= to; d += 1) days.push(d);

  let cursor = 0;
  const jobIds: string[] = [];

  const worker = async () => {
    while (cursor < days.length) {
      if (progress.stop_requested) {
        progress.status = 'stopped';
        progress.message = 'stopped by admin';
        return;
      }
      const cap = await checkPrepareCostCap();
      if (!cap.ok) {
        progress.status = 'capped';
        progress.message = cap.reason;
        console.warn('[v2-prepare:range] cost cap', cap.reason);
        return;
      }

      const day = days[cursor]!;
      cursor += 1;
      progress.current = [
        ...new Set([...progress.current.filter((d) => d !== day), day]),
      ];

      const readiness = await getDayReadiness(day, targetLang);
      if (readiness.ready) {
        progress.skipped_days.push(day);
        progress.current = progress.current.filter((d) => d !== day);
        continue;
      }
      if (readiness.lesson === 'needs_review') {
        progress.needs_review_days.push(day);
        progress.current = progress.current.filter((d) => d !== day);
        continue;
      }

      try {
        const dayCap = await checkPrepareCostCap({ day });
        if (!dayCap.ok) {
          progress.status = 'capped';
          progress.message = dayCap.reason;
          console.warn('[v2-prepare:range] day cost cap', dayCap.reason);
          return;
        }

        const enqueued = await enqueueOrJoinPrepareDay({
          day,
          targetLang,
          startWorker: true,
        });
        if (enqueued.jobId) jobIds.push(enqueued.jobId);

        // Wait until readiness settles (ready / needs_review / failed).
        const deadline = Date.now() + 25 * 60 * 1000;
        while (Date.now() < deadline) {
          if (progress.stop_requested) break;
          const r = await getDayReadiness(day, targetLang);
          if (r.ready) {
            progress.done_days.push(day);
            break;
          }
          if (r.lesson === 'needs_review') {
            progress.needs_review_days.push(day);
            break;
          }
          if (r.error_eg && !r.job_id) {
            progress.failed_days.push(day);
            break;
          }
          await new Promise((res) => setTimeout(res, 4000));
        }
      } catch (err) {
        console.error(
          '[v2-prepare:range] day failed',
          day,
          err instanceof Error ? err.message : err,
        );
        progress.failed_days.push(day);
      } finally {
        progress.current = progress.current.filter((d) => d !== day);
        progress.cost_usd = await sumJobCost(jobIds);
      }
    }
  };

  await Promise.all(
    Array.from({ length: concurrency }, () => worker()),
  );

  if (progress.status === 'running') {
    progress.status = progress.stop_requested ? 'stopped' : 'done';
  }
  progress.cost_usd = await sumJobCost(jobIds);
  progress.current = [];
  return progress;
}

/** Highest introducedDay across learners (fallback 1). */
export async function furthestActiveLearnerDay(): Promise<number> {
  if (!mongoConfigured()) return 1;
  await connectMongo();
  const docs = await V2ItemStateModel()
    .find({})
    .select({ introducedDay: 1 })
    .sort({ introducedDay: -1 })
    .limit(1)
    .lean();
  const day = Number(docs[0]?.introducedDay ?? 1);
  return Number.isFinite(day) && day > 0 ? day : 1;
}

/**
 * Keep the next `ahead` days after the furthest learner prepared.
 */
export async function runPrepareKeepAhead(opts?: {
  ahead?: number;
  targetLang?: string;
}): Promise<PrepareRangeProgress> {
  const ahead = opts?.ahead ?? 7;
  const furthest = await furthestActiveLearnerDay();
  const from = furthest + 1;
  const to = furthest + ahead;
  return runPrepareDayRange({
    from,
    to,
    concurrency: 2,
    targetLang: opts?.targetLang,
    runId: `keepahead-${furthest}-${Date.now().toString(36)}`,
  });
}
