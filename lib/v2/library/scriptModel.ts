import { callClaudeJson, extractJson, type ClaudeTokenUsage } from '@/lib/generation/claudeClient';
import { estimateUsd, round4 } from '@/lib/v2/generation/lesson/prices';
import type { FatalProblem } from './scriptChecks';
import type { JobCost } from './jobs';

/**
 * Model access for the script stage. `CallModel` is injectable so tests
 * never touch Anthropic.
 */

export type ModelResult = {
  /** Parsed JSON. If absent, `text` is parsed instead. */
  data?: unknown;
  /** Raw model text (kept for the admin when it does not parse). */
  text?: string;
  usage?: ClaudeTokenUsage;
  model?: string;
};

export type CallModelOptions = {
  model?: string;
  maxTokens: number;
  label: string;
};

export type CallModel = (
  system: string,
  user: string,
  opts: CallModelOptions,
) => Promise<ModelResult>;

/** Env LIBRARY_SCRIPT_MODEL; falls back to the client default when unset. */
export function scriptModelId(): string | undefined {
  return process.env.LIBRARY_SCRIPT_MODEL?.trim() || undefined;
}

/** Display name for the admin tooltip. */
export function scriptModelLabel(): string {
  return (
    scriptModelId() || process.env.CLAUDE_MODEL?.trim() || 'claude-sonnet-5-5'
  );
}

export const defaultCallModel: CallModel = async (system, user, opts) => {
  const r = await callClaudeJson(system, user, {
    model: opts.model,
    maxTokens: opts.maxTokens,
    label: opts.label,
    skipProviderFork: true,
  });
  return { data: r.data, usage: r.usage, model: r.model };
};

export const SCRIPT_MAX_TOKENS = 16_000;
export const REWRITE_MAX_TOKENS = 4_000;
const RAW_CAP = 200_000;

export type AttemptLog = {
  attempt: number;
  raw: string;
  errors: FatalProblem[];
};

export type UsageTotals = {
  calls: number;
  input_tokens: number;
  output_tokens: number;
  model?: string;
};

export function emptyUsage(): UsageTotals {
  return { calls: 0, input_tokens: 0, output_tokens: 0 };
}

export function addUsage(t: UsageTotals, r: ModelResult): void {
  t.calls += 1;
  t.input_tokens += r.usage?.input_tokens ?? 0;
  t.output_tokens += r.usage?.output_tokens ?? 0;
  if (r.model) t.model = r.model;
}

export function usageCost(t: UsageTotals, fallbackModel: string): JobCost {
  const model = t.model || fallbackModel;
  return {
    model,
    calls: t.calls,
    input_tokens: t.input_tokens,
    output_tokens: t.output_tokens,
    usd: round4(
      estimateUsd('anthropic', model, {
        input_tokens: t.input_tokens,
        output_tokens: t.output_tokens,
      }),
    ),
  };
}

export type ParseOutcome<T> =
  | { value: T; fatal?: undefined }
  | { value?: undefined; fatal: FatalProblem[] };

export type CallWithRetryResult<T> =
  | { ok: true; value: T; attempts: AttemptLog[]; usage: UsageTotals }
  | { ok: false; attempts: AttemptLog[]; usage: UsageTotals };

function clip(s: string): string {
  return s.length > RAW_CAP ? s.slice(0, RAW_CAP) : s;
}

/**
 * Call the model; on a fatal problem retry ONCE with the problems appended.
 * Every attempt's raw output is kept so the admin can see it when both fail.
 */
export async function callWithRetry<T>(opts: {
  callModel: CallModel;
  system: string;
  user: string;
  model?: string;
  maxTokens: number;
  label: string;
  parse: (data: unknown) => ParseOutcome<T>;
  maxAttempts?: number;
}): Promise<CallWithRetryResult<T>> {
  const maxAttempts = opts.maxAttempts ?? 2;
  const attempts: AttemptLog[] = [];
  const usage = emptyUsage();
  let user = opts.user;

  for (let n = 1; n <= maxAttempts; n++) {
    let data: unknown;
    let raw = '';
    let errors: FatalProblem[] = [];
    try {
      const r = await opts.callModel(opts.system, user, {
        model: opts.model,
        maxTokens: opts.maxTokens,
        label: n === 1 ? opts.label : `${opts.label}:retry`,
      });
      addUsage(usage, r);
      if (r.data !== undefined) {
        data = r.data;
        raw = r.text ?? JSON.stringify(r.data);
      } else {
        raw = r.text ?? '';
        try {
          data = extractJson(raw);
        } catch (e) {
          errors = [
            {
              code: 'no_parse',
              message: e instanceof Error ? e.message : 'Output did not parse',
            },
          ];
        }
      }
    } catch (e) {
      raw = `[model call failed] ${e instanceof Error ? e.message : String(e)}`;
      errors = [
        {
          code: 'no_parse',
          message: e instanceof Error ? e.message : 'Model call failed',
        },
      ];
    }

    if (errors.length === 0) {
      const outcome = opts.parse(data);
      if (outcome.value !== undefined) {
        return { ok: true, value: outcome.value, attempts, usage };
      }
      errors = outcome.fatal?.length
        ? outcome.fatal
        : [{ code: 'no_parse', message: 'Output could not be used' }];
    }
    attempts.push({ attempt: n, raw: clip(raw), errors });
    if (n < maxAttempts) {
      const listed = errors
        .slice(0, 10)
        .map((e) => `- ${e.message}`)
        .join('\n');
      user = `${opts.user}\n\nYour previous reply was rejected for these problems. Fix them and reply again with the complete JSON object only:\n${listed}`;
    }
  }
  return { ok: false, attempts, usage };
}
