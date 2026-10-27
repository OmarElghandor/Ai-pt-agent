import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2JobModel, type V2JobKind } from '@/lib/v2/mongo/models';

/** Per-job system / input / output token budgets (defaults; overridden by p90). */
export const BUDGETS = {
  items: { system: 600, input: 1000, output: 3000 },
  outline: { system: 400, input: 800, output: 800 },
  page: { system: 900, input: 1500, output: 3500 },
  critic: { system: 300, input: 2500, output: 300 },
  questions: { system: 500, input: 800, output: 1500 },
  micro: { system: 400, input: 600, output: 1200 },
  daily_use: { system: 400, input: 600, output: 1200 },
  continuity: { system: 300, input: 800, output: 100 },
  lang_check: { system: 400, input: 2500, output: 800 },
} as const;

export type BudgetKind = keyof typeof BUDGETS;

export type JobBudget = {
  system: number;
  input: number;
  output: number;
};

/** @deprecated Prefer getBudget(kind). Kept for legacy orchestrator callers. */
export const BUDGET = {
  systemMax: 1500,
  inputMax: 3000,
  outputMax: 6000,
  maxTokens: 6000,
} as const;

export type TokenBreakdown = {
  system: number;
  input: number;
  output: number;
  example_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

const p90Cache = new Map<string, { output: number; at: number }>();

function percentile90(values: number[]): number | null {
  if (values.length < 5) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * 0.9) - 1,
  );
  return sorted[Math.max(0, idx)] ?? null;
}

/** Load last 20 done jobs' output tokens for a kind; cache 5 minutes. */
export async function observedOutputP90(
  kind: V2JobKind | string,
): Promise<number | null> {
  const hit = p90Cache.get(kind);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.output;
  if (!mongoConfigured()) return null;
  try {
    await connectMongo();
    const docs = await V2JobModel()
      .find({
        kind: kind as V2JobKind,
        status: 'done',
        'tokens.output': { $gt: 0 },
      })
      .sort({ finished_at: -1 })
      .limit(20)
      .select({ tokens: 1 })
      .lean();
    const outs = docs
      .map((d) => Number((d.tokens as { output?: number } | undefined)?.output))
      .filter((n) => Number.isFinite(n) && n > 0);
    const p90 = percentile90(outs);
    if (p90 != null) {
      p90Cache.set(kind, { output: p90, at: Date.now() });
      console.info(
        `[v2-gen:budget] kind=${kind} p90_output=${p90} samples=${outs.length} maxTokens≈${Math.ceil(p90 * 1.3)}`,
      );
    }
    return p90;
  } catch {
    return null;
  }
}

export function getBudget(kind: V2JobKind | string): JobBudget | null {
  if (kind in BUDGETS) return { ...BUDGETS[kind as BudgetKind] };
  return null;
}

/** Sync budget (defaults). Prefer resolveBudget for p90. */
export function isOverBudget(
  t: TokenBreakdown,
  kind?: V2JobKind | string,
): boolean {
  const budget = kind ? getBudget(kind) : null;
  const systemMax = budget?.system ?? BUDGET.systemMax;
  const inputMax = budget?.input ?? BUDGET.inputMax;
  const outputMax = budget?.output ?? BUDGET.outputMax;
  const systemNet = Math.max(0, t.system - (t.example_tokens ?? 0));
  return (
    systemNet > systemMax || t.input > inputMax || t.output > outputMax
  );
}

export function approxTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / 4);
}

export function maxTokensForKind(
  kind: V2JobKind | string,
  opts?: { guidedPage?: boolean; observedP90?: number | null },
): number {
  if (kind === 'questions') {
    const p90 = opts?.observedP90;
    if (p90 != null) return Math.max(2000, Math.ceil(p90 * 1.3));
    return 2000;
  }
  const budget = getBudget(kind);
  if (!budget) return BUDGET.maxTokens;
  const p90 = opts?.observedP90;
  if (p90 != null && p90 > 0) {
    const scaled = Math.ceil(p90 * 1.3);
    if (kind === 'page' && opts?.guidedPage) {
      return Math.max(scaled, 10_000);
    }
    return scaled;
  }
  if (kind === 'page' && opts?.guidedPage) {
    return Math.max(budget.output + 2000, 10_000);
  }
  return budget.output + 200;
}

/** Resolve max tokens using last-20 p90 when available. */
export async function resolveMaxTokens(
  kind: V2JobKind | string,
  opts?: { guidedPage?: boolean },
): Promise<number> {
  const p90 = await observedOutputP90(kind);
  return maxTokensForKind(kind, { ...opts, observedP90: p90 });
}
