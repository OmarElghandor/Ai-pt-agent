/**
 * OpenAI-compatible client for v2 lesson-generation jobs (DeepInfra Kimi and Qwen).
 * Uses @ai-sdk/openai-compatible with forced tool calling + JSON parse.
 */
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import {
  extractJson,
  JSON_OUTPUT_RULES,
  type CallClaudeJsonOptions,
  type ClaudeJsonResult,
  type ClaudeSystemBlock,
  type ClaudeTokenUsage,
} from './claudeClient';
import {
  openaiCompatibleApiKey,
  openaiCompatibleBaseUrl,
} from '@/lib/v2/generation/lesson/models';

function flattenSystem(
  systemPrompt: string,
  blocks?: ClaudeSystemBlock[],
): string {
  if (blocks?.length) {
    const parts = blocks.map((b) => b.text);
    if (!parts.some((p) => p.includes('JSON OUTPUT RULES'))) {
      parts.push(JSON_OUTPUT_RULES);
    }
    return parts.join('\n\n');
  }
  return [systemPrompt, JSON_OUTPUT_RULES].filter(Boolean).join('\n\n');
}

function makeProvider() {
  const apiKey = openaiCompatibleApiKey();
  if (!apiKey) {
    throw new Error(
      'V2_OPENAI_COMPAT_API_KEY or DEEPINFRA_API_KEY is not set',
    );
  }
  const baseURL = openaiCompatibleBaseUrl();
  return createOpenAICompatible({
    name: 'v2-openai-compatible',
    baseURL,
    apiKey,
    fetch: async (url, init) => {
      if (init?.body && typeof init.body === 'string') {
        try {
          const body = JSON.parse(init.body) as Record<string, unknown>;
          const model = typeof body.model === 'string' ? body.model : '';
          // Qwen3 thinks by default and burns the token budget. Kimi requests
          // stay unmodified.
          if (/qwen/i.test(model)) {
            body.chat_template_kwargs = { enable_thinking: false };
          }
          return fetch(url, { ...init, body: JSON.stringify(body) });
        } catch {
          // fall through
        }
      }
      return fetch(url, init);
    },
  });
}

/** Loose zod schema when caller only has JSON Schema; accept any object. */
const AnyObjectSchema = z.record(z.string(), z.unknown());

export async function callOpenAICompatibleJson(
  systemPrompt: string,
  userPrompt: string,
  opts: CallClaudeJsonOptions & { model: string; zodSchema?: z.ZodType } = {
    model: '',
  },
): Promise<ClaudeJsonResult> {
  if (!opts.model) {
    throw new Error('callOpenAICompatibleJson requires opts.model');
  }
  const provider = makeProvider();
  const model = provider.chatModel(opts.model);
  const tokens = opts.maxTokens ?? 8_000;
  const started = Date.now();
  const system = flattenSystem(systemPrompt, opts.systemBlocks);

  const toolName = opts.tool?.name ?? 'submit_result';
  const schema = opts.zodSchema ?? AnyObjectSchema;

  const result = await generateText({
    model,
    maxOutputTokens: tokens,
    temperature: 0.2,
    system,
    prompt: userPrompt,
    tools: {
      [toolName]: tool({
        description:
          opts.tool?.description ??
          'Submit the structured JSON result for this stage. Call exactly once.',
        inputSchema: schema,
      }),
    },
    toolChoice: { type: 'tool', toolName },
  });

  const durationMs = Date.now() - started;
  const usage: ClaudeTokenUsage = {
    input_tokens: result.usage?.inputTokens ?? 0,
    output_tokens: result.usage?.outputTokens ?? 0,
  };

  console.info(
    `[v2-gen:call] ${opts.label ?? 'openai-compatible'} ${durationMs}ms in=${usage.input_tokens} out=${usage.output_tokens} model=${opts.model}`,
  );

  const toolParts = result.toolCalls ?? [];
  const match =
    toolParts.find((t) => t.toolName === toolName) ?? toolParts[0];
  if (match && 'input' in match) {
    return {
      data: match.input,
      model: opts.model,
      durationMs,
      usage,
      label: opts.label,
    };
  }

  const text = result.text?.trim() ?? '';
  if (!text) {
    throw new Error(
      'Unexpected openai-compatible response (no tool call or text)',
    );
  }
  return {
    data: extractJson(text),
    model: opts.model,
    durationMs,
    usage,
    label: opts.label,
  };
}
