import { AsyncLocalStorage } from 'node:async_hooks';
import {
  callClaudeJson,
  zodToolSchema,
  type ClaudeSystemBlock,
  type ClaudeTokenUsage,
} from '@/lib/generation/claudeClient';
import { JSON_OUTPUT_RULES } from '@/lib/generation/claudeClient';
import { callOpenAICompatibleJson } from '@/lib/generation/openaiCompatibleClient';
import type { V2JobKind } from '@/lib/v2/mongo/models';
import {
  approxTokens,
  getBudget,
  isOverBudget,
  maxTokensForKind,
  observedOutputP90,
  type TokenBreakdown,
} from '../budgets';
import { callTimingFromResult, type CallTiming } from '../cost';
import { formatLessonBrief, type LessonBrief } from '../brief';
import {
  resolveJobModel,
  shouldCachePrefix,
  type GenProvider,
} from '../models';
import { setJobCurrentPrompt } from './persist';
import type { z } from 'zod';

/** Threaded from processLessonJob so callJobTool can log + persist current_prompt. */
export type JobCallContext = {
  jobId: string;
  day: number;
  version: number;
  page_id?: string | null;
  /** Last LLM prompt for this job — dumped only if the job fails. */
  lastPrompt?: {
    label: string;
    kind: string;
    system: string;
    user: string;
  };
};

export const jobCallContext = new AsyncLocalStorage<JobCallContext>();

/** Console-dump the last callJobTool prompt (failed jobs only). */
export function logLastFailedPrompt(err: unknown): void {
  const ctx = jobCallContext.getStore();
  const p = ctx?.lastPrompt;
  if (!p) return;
  const dayPart =
    ctx != null ? ` day=${ctx.day} v=${ctx.version}` : '';
  const pagePart = ctx?.page_id ? ` page=${ctx.page_id}` : '';
  const message = err instanceof Error ? err.message : String(err);
  console.error(
    `[v2-gen:prompt-body] FAILED label=${p.label} kind=${p.kind}${dayPart}${pagePart} error=${message}\n--- SYSTEM ---\n${p.system}\n--- USER ---\n${p.user}\n--- END ---`,
  );
}

export type JobCallResult = {
  data: unknown;
  timing: CallTiming;
  model: string;
  provider: GenProvider;
  tokens: TokenBreakdown;
  over_budget: boolean;
};

export type JobCallInputMeta = {
  brief: LessonBrief;
  user_payload: string;
  system_modules: { name: string; version: string }[];
  cached_example?: string;
};

export async function callJobTool(opts: {
  label: string;
  kind: V2JobKind | string;
  systemPrompt: string;
  brief: LessonBrief;
  userBody: string;
  toolName: string;
  toolDescription: string;
  schema: z.ZodType;
  /** Extra text after system+brief (e.g. preset example). */
  cachedExtra?: string;
  exampleTokens?: number;
  maxTokens?: number;
  /** Prompt module names shown in admin (not full text). */
  systemModules?: { name: string; version: string }[];
  /** Example file name for admin (not full text). */
  cachedExampleName?: string;
  /** Guided page needs higher maxTokens. */
  guidedPage?: boolean;
  /** Override ALS job id (usually set via jobCallContext). */
  jobId?: string;
}): Promise<JobCallResult> {
  const resolved = resolveJobModel(opts.kind);
  const ctx = jobCallContext.getStore();
  const jobId = opts.jobId ?? ctx?.jobId;
  const dayPart =
    ctx != null ? ` day=${ctx.day} v=${ctx.version}` : '';
  const pagePart = ctx?.page_id ? ` page=${ctx.page_id}` : '';

  console.info(
    `[v2-gen:prompt] label=${opts.label} kind=${opts.kind} model=${resolved.model} provider=${resolved.provider}${dayPart}${pagePart}`,
  );

  if (jobId) {
    void setJobCurrentPrompt(jobId, {
      label: opts.label,
      kind: String(opts.kind),
      model: resolved.model,
      provider: resolved.provider,
      started_at: new Date().toISOString(),
    }).catch((err) => {
      console.warn(
        '[v2-gen:prompt] failed to set progress.current_prompt',
        err instanceof Error ? err.message : err,
      );
    });
  }

  const briefText = formatLessonBrief(opts.brief);
  const prefixParts = [opts.systemPrompt, briefText];
  if (opts.cachedExtra) prefixParts.push(opts.cachedExtra);
  const prefixText = prefixParts.join('\n\n');
  const prefixTokens = approxTokens(prefixText);
  const useCache =
    resolved.provider === 'anthropic' &&
    shouldCachePrefix(resolved.model, prefixTokens);

  const systemBlocks: ClaudeSystemBlock[] = useCache
    ? [
        {
          type: 'text',
          text: prefixText,
          cache_control: { type: 'ephemeral' },
        },
        { type: 'text', text: JSON_OUTPUT_RULES },
      ]
    : [
        { type: 'text', text: prefixText },
        { type: 'text', text: JSON_OUTPUT_RULES },
      ];

  const systemForBudget = approxTokens(
    [opts.systemPrompt, briefText].join('\n\n'),
  );
  const inputApprox = approxTokens(opts.userBody);
  const exampleTokens = opts.exampleTokens ?? 0;

  const budget = getBudget(opts.kind);
  const p90 = await observedOutputP90(opts.kind);
  const defaultMax = maxTokensForKind(opts.kind, {
    guidedPage: opts.guidedPage,
    observedP90: p90,
  });
  const envMax = Number(
    process.env.V2_GEN_MAX_TOKENS || process.env.CLAUDE_MAX_TOKENS,
  );
  const maxTokens =
    opts.maxTokens ??
    (Number.isFinite(envMax) && envMax > 0
      ? Math.min(envMax, defaultMax + 4000)
      : defaultMax);

  if (ctx) {
    ctx.lastPrompt = {
      label: opts.label,
      kind: String(opts.kind),
      system: prefixText,
      user: opts.userBody,
    };
  }

  let result: {
    data: unknown;
    model: string;
    durationMs: number;
    usage?: ClaudeTokenUsage;
  };

  if (
    resolved.provider === 'openai-compatible' ||
    resolved.provider === 'kimi'
  ) {
    result = await callOpenAICompatibleJson('', opts.userBody, {
      label: opts.label,
      maxTokens,
      model: resolved.model,
      systemBlocks,
      tool: {
        name: opts.toolName,
        description: opts.toolDescription,
        inputSchema: zodToolSchema(opts.schema),
      },
      zodSchema: opts.schema,
    });
  } else {
    result = await callClaudeJson('', opts.userBody, {
      label: opts.label,
      maxTokens,
      model: resolved.model,
      skipProviderFork: true,
      systemBlocks,
      tool: {
        name: opts.toolName,
        description: opts.toolDescription,
        inputSchema: zodToolSchema(opts.schema),
      },
    });
  }

  const usage: ClaudeTokenUsage = result.usage ?? {
    input_tokens: inputApprox,
    output_tokens: 0,
  };

  const tokens: TokenBreakdown = {
    system: systemForBudget,
    input: usage.input_tokens ?? inputApprox,
    output: usage.output_tokens ?? 0,
    example_tokens: exampleTokens || undefined,
    cache_creation_input_tokens: usage.cache_creation_input_tokens,
    cache_read_input_tokens: usage.cache_read_input_tokens,
  };

  const over_budget = isOverBudget(tokens, opts.kind);
  if (over_budget) {
    const b = budget
      ? `budget=${budget.system}/${budget.input}/${budget.output}`
      : 'budget=legacy';
    console.warn(
      `[v2-gen:budget] label=${opts.label} kind=${opts.kind} over_budget ${b} actual system=${tokens.system} example=${tokens.example_tokens ?? 0} input=${tokens.input} output=${tokens.output}`,
    );
  }

  return {
    data: result.data,
    timing: callTimingFromResult({
      label: opts.label,
      durationMs: result.durationMs,
      usage,
      provider: resolved.provider,
      model: result.model || resolved.model,
    }),
    model: result.model || resolved.model,
    provider: resolved.provider,
    tokens,
    over_budget,
  };
}

export function buildInputMeta(opts: {
  brief: LessonBrief;
  userBody: string;
  systemModules?: { name: string; version: string }[];
  cachedExampleName?: string;
}): JobCallInputMeta {
  return {
    brief: opts.brief,
    user_payload: opts.userBody,
    system_modules: opts.systemModules ?? [],
    cached_example: opts.cachedExampleName,
  };
}
