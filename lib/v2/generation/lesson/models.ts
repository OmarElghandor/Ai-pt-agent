/**
 * Per-job { provider, model } resolution.
 * Model ids come from env only — no dated Anthropic ids in code.
 *
 * Default provider is Kimi on DeepInfra (`moonshotai/Kimi-K3`).
 * `V2_GEN_PROVIDER=anthropic|claude` restores the Sonnet/Haiku split.
 * Per-job `V2_MODEL_*` specs override that: `kimi:…`, `anthropic:…`,
 * or `openai-compatible:…`.
 *
 * Cache minima source:
 * https://platform.claude.com/docs/en/build-with-claude/prompt-caching
 * (Sonnet 5.5 / Haiku 5.5: 512 tokens; Haiku 4.5 / older Opus: 4096; etc.)
 */
import type { V2JobKind } from '@/lib/v2/mongo/models';

export type GenProvider = 'anthropic' | 'openai-compatible' | 'kimi';

export type JobModelConfig = {
  provider: GenProvider;
  model: string;
};

const SONNET_DEFAULT = 'claude-sonnet-5-5';
const HAIKU_DEFAULT = 'claude-haiku-5-5';
const QWEN_DEFAULT = 'Qwen/Qwen3-32B';
const KIMI_DEFAULT = 'moonshotai/Kimi-K3';

/** Job kinds that call a model (assemble is code-only). */
export const MODEL_JOB_KINDS = [
  'items',
  'outline',
  'page',
  'critic',
  'questions',
  'micro',
  'daily_use',
  'continuity',
  'lang_check',
] as const;

export type ModelJobKind = (typeof MODEL_JOB_KINDS)[number];

const ENV_KEYS: Record<ModelJobKind, string> = {
  items: 'V2_MODEL_ITEMS',
  outline: 'V2_MODEL_OUTLINE',
  page: 'V2_MODEL_PAGE',
  critic: 'V2_MODEL_CRITIC',
  questions: 'V2_MODEL_QUESTIONS',
  micro: 'V2_MODEL_MICRO',
  daily_use: 'V2_MODEL_DAILY_USE',
  continuity: 'V2_MODEL_CONTINUITY',
  lang_check: 'V2_LANG_CHECK_MODEL',
};

const HEAVY_JOBS = new Set<ModelJobKind>(['items', 'page']);

export type ModelProfile = 'default' | 'qwen-light' | 'qwen-all' | 'claude';

/** In-process profile overrides (gen-sample --profile). */
let profileOverrides: Partial<Record<ModelJobKind, JobModelConfig>> | null =
  null;
let activeProfile: ModelProfile = 'default';

function isModelJobKind(kind: string): kind is ModelJobKind {
  return (MODEL_JOB_KINDS as readonly string[]).includes(kind);
}

function claudeDefault(kind: ModelJobKind): JobModelConfig {
  return {
    provider: 'anthropic',
    model: HEAVY_JOBS.has(kind) ? SONNET_DEFAULT : HAIKU_DEFAULT,
  };
}

function qwenDefault(): JobModelConfig {
  return {
    provider: 'openai-compatible',
    model:
      process.env.V2_GEN_MODEL?.trim() ||
      process.env.DEEPINFRA_MODEL?.trim() ||
      QWEN_DEFAULT,
  };
}

function kimiDefault(): JobModelConfig {
  return {
    provider: 'kimi',
    model: process.env.V2_KIMI_MODEL?.trim() || KIMI_DEFAULT,
  };
}

/** Global default when a job has no profile override and no V2_MODEL_* spec. */
function defaultForKind(kind: ModelJobKind): JobModelConfig {
  // Lang-check defaults to Claude Sonnet regardless of gen provider.
  if (kind === 'lang_check') {
    return { provider: 'anthropic', model: SONNET_DEFAULT };
  }
  const global = (process.env.V2_GEN_PROVIDER ?? '').trim().toLowerCase();
  if (global === 'anthropic' || global === 'claude') return claudeDefault(kind);
  if (global === 'qwen' || global === 'deepinfra') return qwenDefault();
  return kimiDefault();
}

export function parseModelSpec(raw: string): JobModelConfig {
  const s = raw.trim();
  const colon = s.indexOf(':');
  if (colon > 0) {
    const provider = s.slice(0, colon).trim().toLowerCase();
    const model = s.slice(colon + 1).trim();
    if (
      (provider === 'anthropic' ||
        provider === 'openai-compatible' ||
        provider === 'kimi') &&
      model
    ) {
      return { provider, model };
    }
  }
  // Bare model id: Claude stays Anthropic; Moonshot Kimi ids use the kimi provider.
  if (/^claude/i.test(s)) return { provider: 'anthropic', model: s };
  if (/^moonshotai\/kimi/i.test(s)) return { provider: 'kimi', model: s };
  return { provider: 'openai-compatible', model: s };
}

export function setModelProfile(profile: ModelProfile | null): void {
  if (!profile || profile === 'default') {
    profileOverrides = null;
    activeProfile = 'default';
    return;
  }
  activeProfile = profile;
  if (profile === 'claude') {
    profileOverrides = Object.fromEntries(
      MODEL_JOB_KINDS.map((kind) => [kind, claudeDefault(kind)]),
    );
    return;
  }
  const qwen = qwenDefault();
  if (profile === 'qwen-all') {
    profileOverrides = Object.fromEntries(
      MODEL_JOB_KINDS.map((kind) => [kind, qwen]),
    );
    return;
  }
  // qwen-light: Qwen for light jobs; items/page stay on the resolved default.
  profileOverrides = {
    outline: qwen,
    questions: qwen,
    micro: qwen,
    daily_use: qwen,
    critic: qwen,
    continuity: qwen,
  };
}

export function getModelProfile(): ModelProfile {
  return activeProfile;
}

export function resolveJobModel(kind: V2JobKind | string): JobModelConfig {
  if (!isModelJobKind(kind)) return defaultForKind('continuity');
  if (profileOverrides?.[kind]) return profileOverrides[kind]!;
  const raw = process.env[ENV_KEYS[kind]]?.trim();
  if (raw) return parseModelSpec(raw);
  return defaultForKind(kind);
}

/**
 * Minimum cacheable prefix tokens by model family.
 * Source: Anthropic prompt caching docs (2026).
 * Shorter prefixes are silently not cached — skip cache_control instead.
 */
export function minCacheableTokens(model: string): number {
  const m = model.toLowerCase();
  // 5.5 / Opus 5 / Fable / Mythos family → 512
  if (
    m.includes('sonnet-5-5') ||
    m.includes('haiku-5-5') ||
    m.includes('opus-5') ||
    m.includes('fable') ||
    m.includes('mythos')
  ) {
    return 512;
  }
  // Haiku 4.5 / Opus 4.6 / 4.5 → 4096
  if (
    m.includes('haiku-4-5') ||
    m.includes('opus-4-6') ||
    m.includes('opus-4-5')
  ) {
    return 4096;
  }
  // Opus 4.7 / Haiku 3.5 → 2048
  if (m.includes('opus-4-7') || m.includes('haiku-3-5')) {
    return 2048;
  }
  // Sonnet 4.x / Opus 4 / Sonnet 5 (non-5.5) → 1024
  if (
    m.includes('sonnet-4') ||
    m.includes('opus-4') ||
    m.includes('sonnet-5')
  ) {
    return 1024;
  }
  // Default conservative for unknown Anthropic ids
  return 1024;
}

export function shouldCachePrefix(
  model: string,
  approxPrefixTokens: number,
): boolean {
  return approxPrefixTokens >= minCacheableTokens(model);
}

export function openaiCompatibleBaseUrl(): string {
  return (
    process.env.V2_OPENAI_COMPAT_BASE_URL?.trim() ||
    'https://api.deepinfra.com/v1/openai'
  );
}

export function openaiCompatibleApiKey(): string {
  return (
    process.env.V2_OPENAI_COMPAT_API_KEY?.trim() ||
    process.env.DEEPINFRA_API_KEY?.trim() ||
    ''
  );
}
