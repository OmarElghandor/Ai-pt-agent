import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

/**
 * DeepInfra OpenAI-compatible provider.
 * Qwen3.5 has thinking ON by default — without enable_thinking:false the
 * model spends its token budget on reasoning_content and returns empty content.
 * Injected via custom fetch so the field always reaches the wire.
 */
const deepinfra = createOpenAICompatible({
  name: 'deepinfra',
  baseURL: 'https://api.deepinfra.com/v1/openai',
  apiKey: process.env.DEEPINFRA_API_KEY ?? '',
  fetch: async (url, init) => {
    if (init?.body && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body) as Record<string, unknown>;
        body.chat_template_kwargs = { enable_thinking: false };
        return fetch(url, { ...init, body: JSON.stringify(body) });
      } catch {
        // fall through with original body
      }
    }
    return fetch(url, init);
  },
});

export function getClassifierModel(): LanguageModel {
  // Qwen2.5-32B-Instruct is no longer served. Qwen3-32B is the mid-size
  // replacement; the provider fetch keeps thinking off.
  const modelId =
    process.env.DEEPINFRA_CLASSIFIER_MODEL ?? 'Qwen/Qwen3-32B';
  return deepinfra(modelId);
}

export function getChatModel(): LanguageModel {
  const provider = process.env.MODEL_PROVIDER ?? 'deepinfra';
  const modelId =
    process.env.DEEPINFRA_MODEL ?? 'Qwen/Qwen3.5-35B-A3B';

  if (provider === 'gemini') {
    // Placeholder for A/B — wire @ai-sdk/google when needed
    console.warn(
      '[model] MODEL_PROVIDER=gemini requested but DeepInfra is the active path; using',
      modelId,
    );
  }

  return deepinfra(modelId);
}

export type ConvoModelSpec = {
  provider: 'deepinfra' | 'anthropic';
  modelId: string;
  label: string;
};

const DEFAULT_CONVO_QWEN = 'Qwen/Qwen3.5-35B-A3B';
const DEFAULT_CONVO_HAIKU = 'claude-haiku-5-5';

/**
 * Parse `V2_CONVO_MODEL` (`deepinfra:…` | `anthropic:…` | bare model id).
 * Cookie / body override may pass the same string (dev A/B).
 */
export function parseConvoModelSpec(raw?: string | null): ConvoModelSpec {
  const s = (raw ?? process.env.V2_CONVO_MODEL ?? '').trim();
  if (!s) {
    return {
      provider: 'deepinfra',
      modelId: process.env.DEEPINFRA_MODEL ?? DEFAULT_CONVO_QWEN,
      label: 'qwen',
    };
  }
  const lower = s.toLowerCase();
  if (lower === 'qwen' || lower === 'deepinfra') {
    return {
      provider: 'deepinfra',
      modelId: process.env.DEEPINFRA_MODEL ?? DEFAULT_CONVO_QWEN,
      label: 'qwen',
    };
  }
  if (lower === 'haiku' || lower === 'anthropic' || lower === 'claude') {
    return {
      provider: 'anthropic',
      modelId:
        process.env.CLAUDE_HAIKU_MODEL?.trim() || DEFAULT_CONVO_HAIKU,
      label: 'haiku',
    };
  }
  const colon = s.indexOf(':');
  if (colon > 0) {
    const provider = s.slice(0, colon).trim().toLowerCase();
    const modelId = s.slice(colon + 1).trim();
    if (provider === 'anthropic' || provider === 'claude') {
      return {
        provider: 'anthropic',
        modelId: modelId || DEFAULT_CONVO_HAIKU,
        label: 'haiku',
      };
    }
    return {
      provider: 'deepinfra',
      modelId: modelId || DEFAULT_CONVO_QWEN,
      label: 'qwen',
    };
  }
  if (/^claude/i.test(s) || /haiku/i.test(s)) {
    return { provider: 'anthropic', modelId: s, label: 'haiku' };
  }
  return { provider: 'deepinfra', modelId: s, label: 'qwen' };
}

/** Character / free-talk model (v4 V7). Override with `V2_CONVO_MODEL` or `override`. */
export function getConvoModel(override?: string | null): LanguageModel {
  const spec = parseConvoModelSpec(override);
  if (spec.provider === 'anthropic') {
    const anthropic = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    });
    return anthropic(spec.modelId);
  }
  return deepinfra(spec.modelId);
}

/** Side-channel coach model. Rare calls — override with V2_COACH_MODEL. */
export function getCoachModel(): LanguageModel {
  const modelId =
    process.env.V2_COACH_MODEL?.trim() ||
    process.env.DEEPINFRA_MODEL ||
    'Qwen/Qwen3.5-35B-A3B';
  return deepinfra(modelId);
}
