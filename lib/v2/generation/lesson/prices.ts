/**
 * Per-provider price table (USD per million tokens).
 * Refine after pilot; used for job-level usd_estimate.
 */
export type PriceRow = {
  input: number;
  output: number;
  cache_read?: number;
  cache_write?: number;
};

const PRICES: Record<string, PriceRow> = {
  // Anthropic — approximate public rates
  'claude-sonnet-5-5': {
    input: 3,
    output: 15,
    cache_read: 0.3,
    cache_write: 3.75,
  },
  'claude-haiku-5-5': {
    input: 1,
    output: 5,
    cache_read: 0.1,
    cache_write: 1.25,
  },
  // OpenAI-compatible / DeepInfra Qwen (ballpark)
  'Qwen/Qwen3-32B': { input: 0.1, output: 0.3 },
  'Qwen/Qwen3.5-35B-A3B': { input: 0.1, output: 0.3 },
  // DeepInfra Kimi K3 — https://deepinfra.com/moonshotai/Kimi-K3
  'moonshotai/Kimi-K3': {
    input: 2.85,
    output: 14.25,
    cache_read: 0.285,
  },
};

const DEFAULT_ANTHROPIC: PriceRow = {
  input: 3,
  output: 15,
  cache_read: 0.3,
  cache_write: 3.75,
};

const DEFAULT_OPENAI_COMPAT: PriceRow = { input: 0.1, output: 0.3 };

const DEFAULT_KIMI: PriceRow = {
  input: 2.85,
  output: 14.25,
  cache_read: 0.285,
};

export function priceForModel(
  provider: string,
  model: string,
): PriceRow {
  if (PRICES[model]) return PRICES[model];
  const lower = model.toLowerCase();
  for (const [key, row] of Object.entries(PRICES)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return row;
    }
  }
  if (provider === 'kimi') return DEFAULT_KIMI;
  if (provider === 'openai-compatible') return DEFAULT_OPENAI_COMPAT;
  if (lower.includes('haiku')) {
    return PRICES['claude-haiku-5-5'] ?? DEFAULT_ANTHROPIC;
  }
  if (lower.includes('sonnet')) {
    return PRICES['claude-sonnet-5-5'] ?? DEFAULT_ANTHROPIC;
  }
  return provider === 'anthropic' ? DEFAULT_ANTHROPIC : DEFAULT_OPENAI_COMPAT;
}

export type UsageForPrice = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

export function estimateUsd(
  provider: string,
  model: string,
  usage: UsageForPrice,
): number {
  const p = priceForModel(provider, model);
  const inn = usage.input_tokens ?? 0;
  const out = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  return (
    (inn / 1_000_000) * p.input +
    (out / 1_000_000) * p.output +
    (cacheRead / 1_000_000) * (p.cache_read ?? 0) +
    (cacheWrite / 1_000_000) * (p.cache_write ?? 0)
  );
}

export function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
