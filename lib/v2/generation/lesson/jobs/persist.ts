import { V2JobModel } from '@/lib/v2/mongo/models';
import type { CallTiming } from '../cost';
import type { TokenBreakdown } from '../budgets';
import type { JobCallInputMeta } from './call';

export type JobAttemptRecord = {
  attempt: number;
  started_at?: Date;
  finished_at?: Date;
  input?: JobCallInputMeta;
  output?: unknown;
  tokens?: TokenBreakdown;
  over_budget?: boolean;
  issues?: unknown;
  provider?: string;
  model?: string;
  usd_estimate?: number;
};

export async function markJobStarted(jobId: string): Promise<void> {
  await V2JobModel().updateOne(
    { _id: jobId },
    { $set: { started_at: new Date() } },
  );
}

export type CurrentPromptProgress = {
  label: string;
  kind: string;
  model: string;
  provider?: string;
  started_at: string;
};

/** In-flight LLM call — visible on admin job graph while status=running. */
export async function setJobCurrentPrompt(
  jobId: string,
  prompt: CurrentPromptProgress,
): Promise<void> {
  await V2JobModel().updateOne(
    { _id: jobId, status: 'running' },
    {
      $set: {
        'progress.current_prompt': prompt,
      },
    },
  );
}

export async function clearJobCurrentPrompt(jobId: string): Promise<void> {
  await V2JobModel().updateOne(
    { _id: jobId },
    { $unset: { 'progress.current_prompt': 1 } },
  );
}

export async function finishJobSuccess(opts: {
  jobId: string;
  provider?: string;
  model?: string;
  timing?: CallTiming;
  tokens?: TokenBreakdown;
  over_budget?: boolean;
  input?: JobCallInputMeta;
  output?: unknown;
  handoff?: unknown;
  issues?: unknown;
  attempts?: JobAttemptRecord[];
  extraProgress?: Record<string, unknown>;
}): Promise<void> {
  const finished_at = new Date();
  const existing = await V2JobModel()
    .findById(opts.jobId)
    .select({ started_at: 1 })
    .lean();
  const started = existing?.started_at
    ? new Date(existing.started_at as Date).getTime()
    : null;
  const wallMs =
    started != null ? Math.max(0, finished_at.getTime() - started) : 0;
  const timing: CallTiming | undefined = opts.timing
    ? {
        ...opts.timing,
        duration_ms:
          opts.timing.duration_ms > 0 ? opts.timing.duration_ms : wallMs,
      }
    : wallMs > 0
      ? {
          label: 'job',
          duration_ms: wallMs,
          input_tokens: 0,
          output_tokens: 0,
          usd_estimate: 0,
        }
      : undefined;
  const usd = timing?.usd_estimate ?? opts.timing?.usd_estimate ?? 0;
  await V2JobModel().updateOne(
    { _id: opts.jobId },
    {
      $set: {
        status: 'done',
        finished_at,
        provider: opts.provider,
        model: opts.model,
        input: opts.input,
        output: opts.output,
        handoff: opts.handoff,
        tokens: opts.tokens,
        over_budget: opts.over_budget ?? false,
        usd_estimate: usd,
        issues: opts.issues,
        attempts: opts.attempts ?? [],
        progress: {
          timing,
          tokens: opts.tokens,
          over_budget: opts.over_budget,
          usd_estimate: usd,
          ...(opts.extraProgress ?? {}),
        },
      },
      $unset: { error: 1, worker_id: 1, lease_expires_at: 1 },
    },
  );
}

export async function finishJobFailed(
  jobId: string,
  message: string,
): Promise<void> {
  await V2JobModel().updateOne(
    { _id: jobId },
    {
      $set: {
        status: 'failed',
        error: message,
        finished_at: new Date(),
      },
      $unset: {
        worker_id: 1,
        lease_expires_at: 1,
        'progress.current_prompt': 1,
      },
    },
  );
}
