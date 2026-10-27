import { estimateUsd, round4, type UsageForPrice } from './prices';

export type TokenUsage = UsageForPrice;

export type CallTiming = {
  label: string;
  duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  usd_estimate: number;
  provider?: string;
  model?: string;
};

export type DayCost = {
  claude: {
    model: string;
    duration_ms: number;
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    usd_estimate: number;
  };
  images: {
    generated: number;
    skipped: number;
    flagged: number;
    usd_estimate: number;
  };
  calls?: CallTiming[];
  total_usd_estimate: number;
};

const IMAGE_EACH = 0.02;

/** @deprecated Prefer estimateUsd(provider, model, usage). */
export function estimateClaudeUsd(usage: TokenUsage): number {
  return estimateUsd('anthropic', 'claude-sonnet-5-5', usage);
}

export function callTimingFromResult(opts: {
  label: string;
  durationMs: number;
  usage?: TokenUsage;
  provider?: string;
  model?: string;
}): CallTiming {
  const usage = opts.usage ?? {};
  const provider = opts.provider ?? 'anthropic';
  const model = opts.model ?? 'claude-sonnet-5-5';
  return {
    label: opts.label,
    duration_ms: opts.durationMs,
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens,
    cache_read_input_tokens: usage.cache_read_input_tokens,
    usd_estimate: round4(estimateUsd(provider, model, usage)),
    provider,
    model,
  };
}

export function sumUsage(calls: CallTiming[]): TokenUsage {
  return calls.reduce<TokenUsage>(
    (acc, c) => ({
      input_tokens: (acc.input_tokens ?? 0) + c.input_tokens,
      output_tokens: (acc.output_tokens ?? 0) + c.output_tokens,
      cache_creation_input_tokens:
        (acc.cache_creation_input_tokens ?? 0) +
        (c.cache_creation_input_tokens ?? 0),
      cache_read_input_tokens:
        (acc.cache_read_input_tokens ?? 0) + (c.cache_read_input_tokens ?? 0),
    }),
    {},
  );
}

export function buildDayCost(opts: {
  model: string;
  durationMs: number;
  usage: TokenUsage;
  images: { generated: number; skipped: number; flagged: number };
  calls?: CallTiming[];
  provider?: string;
}): DayCost {
  const provider = opts.provider ?? 'anthropic';
  const claudeUsd = estimateUsd(provider, opts.model, opts.usage);
  const imageUsd = opts.images.generated * IMAGE_EACH;
  return {
    claude: {
      model: opts.model,
      duration_ms: opts.durationMs,
      input_tokens: opts.usage.input_tokens ?? 0,
      output_tokens: opts.usage.output_tokens ?? 0,
      cache_creation_input_tokens: opts.usage.cache_creation_input_tokens,
      cache_read_input_tokens: opts.usage.cache_read_input_tokens,
      usd_estimate: round4(claudeUsd),
    },
    images: {
      ...opts.images,
      usd_estimate: round4(imageUsd),
    },
    calls: opts.calls,
    total_usd_estimate: round4(claudeUsd + imageUsd),
  };
}

export function logDayCost(day: number, cost: DayCost): void {
  console.info(
    `[v2-gen] day ${day} cost: claude≈$${cost.claude.usd_estimate} (${cost.claude.input_tokens}+${cost.claude.output_tokens} tok, ${cost.claude.duration_ms}ms) images≈$${cost.images.usd_estimate} (${cost.images.generated} gen / ${cost.images.flagged} flagged) total≈$${cost.total_usd_estimate}`,
  );
}

/** Print a markdown-ish timing table for one day run. */
export function printTimingTable(
  day: number,
  calls: CallTiming[],
  wallMs?: number,
): void {
  const header =
    '| label | ms | in | out | cache_read | cache_create | usd |';
  const sep = '|---|---:|---:|---:|---:|---:|---:|';
  const rows = calls.map((c) => {
    return `| ${c.label} | ${c.duration_ms} | ${c.input_tokens} | ${c.output_tokens} | ${c.cache_read_input_tokens ?? 0} | ${c.cache_creation_input_tokens ?? 0} | $${c.usd_estimate} |`;
  });
  const usage = sumUsage(calls);
  const totalUsd = round4(
    estimateUsd(
      calls[0]?.provider ?? 'anthropic',
      calls[0]?.model ?? 'claude-sonnet-5-5',
      usage,
    ),
  );
  const sumMs = calls.reduce((a, c) => a + c.duration_ms, 0);
  rows.push(
    `| TOTAL | ${wallMs ?? sumMs} | ${usage.input_tokens ?? 0} | ${usage.output_tokens ?? 0} | ${usage.cache_read_input_tokens ?? 0} | ${usage.cache_creation_input_tokens ?? 0} | $${totalUsd} |`,
  );
  console.info(
    `\n[v2-gen] Day ${day} timing table\n${header}\n${sep}\n${rows.join('\n')}\n`,
  );
}

export { round4 };
