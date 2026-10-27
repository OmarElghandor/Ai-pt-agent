/**
 * OpenAI-compatible DeepInfra client for v2 lesson-generation jobs.
 * Used when V2_GEN_PROVIDER=deepinfra (Qwen via DeepInfra).
 */
import {
  extractJson,
  JSON_OUTPUT_RULES,
  type CallClaudeJsonOptions,
  type ClaudeJsonResult,
  type ClaudeSystemBlock,
  type ClaudeTokenUsage,
} from './claudeClient';

const DEEPINFRA_URL = 'https://api.deepinfra.com/v1/openai/chat/completions';

function getDeepinfraModel(): string {
  return (
    process.env.V2_GEN_MODEL?.trim() ||
    process.env.DEEPINFRA_MODEL?.trim() ||
    'Qwen/Qwen3-32B'
  );
}

/**
 * Zod's toJSONSchema emits shapes DeepInfra's tool validator can choke on
 * (e.g. additionalProperties: {}, items: {}). Normalize to OpenAI-safe JSON Schema.
 */
export function sanitizeToolParameters(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;
    const obj = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === '$schema' || key === '$id') continue;
      if (
        (key === 'additionalProperties' || key === 'items' || key === 'unevaluatedProperties') &&
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.keys(value as object).length === 0
      ) {
        // Empty schema object ≡ allow anything; DeepInfra prefers boolean true.
        out[key] = true;
        continue;
      }
      out[key] = walk(value);
    }
    return out;
  };
  return walk(schema) as Record<string, unknown>;
}

function unwrapToolPayload(data: unknown, toolName?: string): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const obj = data as Record<string, unknown>;
  // Model sometimes writes OpenAI tool-call shape as plain JSON text.
  if (
    typeof obj.arguments === 'string' &&
    (obj.name === toolName || typeof obj.name === 'string')
  ) {
    try {
      return JSON.parse(obj.arguments as string);
    } catch {
      return data;
    }
  }
  if (
    obj.arguments &&
    typeof obj.arguments === 'object' &&
    (obj.name === toolName || typeof obj.name === 'string')
  ) {
    return obj.arguments;
  }
  if (
    obj.parameters &&
    typeof obj.parameters === 'object' &&
    (obj.name === toolName || typeof obj.name === 'string')
  ) {
    return obj.parameters;
  }
  return data;
}

function defaultMaxTokens(): number {
  const n = Number(process.env.V2_GEN_MAX_TOKENS || process.env.CLAUDE_MAX_TOKENS);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 16_000) : 8_000;
}

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

function logCall(
  label: string | undefined,
  durationMs: number,
  usage: ClaudeTokenUsage,
  extra?: Record<string, unknown>,
) {
  console.info(
    `[v2-gen:call] ${label ?? 'deepinfra'} ${durationMs}ms in=${usage.input_tokens} out=${usage.output_tokens} model=${extra?.model ?? 'deepinfra'}${
      extra?.stopReason ? ` stop=${extra.stopReason}` : ''
    }${extra?.maxTokens != null ? ` max=${extra.maxTokens}` : ''}`,
  );
}

type OpenAIToolCall = {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
};

type OpenAIMessage = {
  role?: string;
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
};

type OpenAIChatResponse = {
  model?: string;
  choices?: { message?: OpenAIMessage; finish_reason?: string }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
};

export async function callDeepinfraJson(
  systemPrompt: string,
  userPrompt: string,
  opts: CallClaudeJsonOptions = {},
): Promise<ClaudeJsonResult> {
  const apiKey = process.env.DEEPINFRA_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPINFRA_API_KEY is not set');
  }
  const model = getDeepinfraModel();
  const tokens = opts.maxTokens ?? defaultMaxTokens();
  const started = Date.now();
  const system = flattenSystem(systemPrompt, opts.systemBlocks);

  const body: Record<string, unknown> = {
    model,
    max_tokens: tokens,
    temperature: 0.2,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt },
    ],
    // Keep Qwen3 thinking off when served via DeepInfra chat template.
    chat_template_kwargs: { enable_thinking: false },
  };

  if (opts.tool) {
    body.tools = [
      {
        type: 'function',
        function: {
          name: opts.tool.name,
          description:
            opts.tool.description ??
            'Submit the structured JSON result for this stage. Call exactly once.',
          parameters: sanitizeToolParameters(opts.tool.inputSchema),
        },
      },
    ];
    body.tool_choice = {
      type: 'function',
      function: { name: opts.tool.name },
    };
  }

  const res = await fetch(DEEPINFRA_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const rawText = await res.text();
  let json: OpenAIChatResponse;
  try {
    json = JSON.parse(rawText) as OpenAIChatResponse;
  } catch {
    throw new Error(
      `DeepInfra non-JSON response (${res.status}): ${rawText.slice(0, 400)}`,
    );
  }
  if (!res.ok) {
    throw new Error(
      `DeepInfra ${res.status}: ${json.error?.message ?? rawText.slice(0, 400)}`,
    );
  }

  const usage: ClaudeTokenUsage = {
    input_tokens: json.usage?.prompt_tokens ?? 0,
    output_tokens: json.usage?.completion_tokens ?? 0,
  };
  const durationMs = Date.now() - started;
  const choice = json.choices?.[0];
  const finish = choice?.finish_reason;
  const resolvedModel = json.model ?? model;
  logCall(opts.label, durationMs, usage, {
    stopReason: finish,
    maxTokens: tokens,
    model: resolvedModel,
  });

  if (finish === 'length') {
    throw new Error(
      `DeepInfra hit max_tokens (${tokens}). Increase V2_GEN_MAX_TOKENS.`,
    );
  }

  const msg = choice?.message;
  const toolCalls = msg?.tool_calls ?? [];
  const wanted = opts.tool?.name;
  const match = wanted
    ? toolCalls.find((t) => t.function?.name === wanted) ?? toolCalls[0]
    : toolCalls[0];

  if (match?.function?.arguments) {
    try {
      const data = unwrapToolPayload(
        JSON.parse(match.function.arguments) as unknown,
        wanted,
      );
      return {
        data,
        model: resolvedModel,
        durationMs,
        usage,
        label: opts.label,
      };
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      // Fall through to text parse / repair-style extract
      console.warn(
        `[v2-gen:json] label=${opts.label ?? 'deepinfra'} tool_args_parse_error=${m}`,
      );
    }
  }

  const text = typeof msg?.content === 'string' ? msg.content : '';
  if (!text) {
    throw new Error(
      'Unexpected DeepInfra response (no tool_calls or text content)',
    );
  }

  return {
    data: unwrapToolPayload(extractJson(text), wanted),
    model: resolvedModel,
    durationMs,
    usage,
    label: opts.label,
  };
}

export function isDeepinfraGenEnabled(): boolean {
  const p = (process.env.V2_GEN_PROVIDER ?? '').trim().toLowerCase();
  if (p === 'deepinfra' || p === 'qwen') return true;
  // Explicit anthropic wins
  if (p === 'anthropic' || p === 'claude') return false;
  return false;
}
