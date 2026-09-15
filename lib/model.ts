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
