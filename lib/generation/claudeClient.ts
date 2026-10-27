import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const JSON_OUTPUT_RULES = `
JSON OUTPUT RULES (mandatory)
- Reply with ONE JSON object only. No markdown fences, no commentary before or after.
- Valid JSON: double-quoted keys and strings, commas between elements, no trailing commas.
- Escape every " inside string values as \\". No raw newlines inside strings (use \\n).
- Do not truncate. Finish every array and object. The response must parse with JSON.parse.
`.trim();

let repairFallbackCount = 0;

/** How many times repairJson has run in this process (for tests / ops). */
export function getRepairFallbackCount(): number {
  return repairFallbackCount;
}

/** @internal test helper */
export function resetRepairFallbackCount(): void {
  repairFallbackCount = 0;
}

export function extractJson(text: string): unknown {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let body = fenced ? fenced[1].trim() : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Claude response did not contain JSON object');
  }
  body = body.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON from model: ${msg}`);
  }
}

/**
 * Convert a Zod schema to an Anthropic tool input_schema (JSON Schema object).
 * Strips `$schema` which Anthropic does not need.
 */
export function zodToolSchema(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema) as Record<string, unknown>;
  const { $schema: _drop, ...rest } = raw;
  return rest;
}

function getClaudeModel(override?: string): string {
  // Env-only ids; no dated model strings baked in as defaults for v2.
  const raw =
    override?.trim() ||
    process.env.CLAUDE_MODEL?.trim() ||
    'claude-sonnet-5-5';
  return raw;
}

/**
 * Claude Sonnet/Haiku/Opus 5.5 reject tool_choice type "tool" | "any" (400).
 * Use auto + prompt (and prefer strict tools when the schema allows).
 * Source: https://platform.claude.com/docs/en/models/sonnet-5-5/migration-guide
 */
export function forcedToolChoiceUnsupported(model: string): boolean {
  const m = model.toLowerCase();
  return /(?:sonnet|haiku|opus)-5-5\b/.test(m) || /\bclaude-5-5\b/.test(m);
}


function defaultMaxTokens(): number {
  const n = Number(process.env.CLAUDE_MAX_TOKENS);
  return Number.isFinite(n) && n > 0 ? n : 24_000;
}

export type ClaudeTokenUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

export type ClaudeSystemBlock = {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
};

export type CallClaudeJsonOptions = {
  maxTokens?: number;
  /** Label for timing logs (e.g. outline, page:p1). */
  label?: string;
  /** Explicit model id (overrides CLAUDE_MODEL / default). */
  model?: string;
  /**
   * When set, used as the Anthropic `system` parameter (supports prompt caching).
   * JSON_OUTPUT_RULES are appended as a final uncached block unless already present.
   */
  systemBlocks?: ClaudeSystemBlock[];
  /**
   * Forced tool use for structured output. When set, the model must call this tool;
   * `input` becomes `data`. Text/JSON repair remains a fallback if tool_use is missing.
   */
  tool?: {
    name: string;
    description?: string;
    inputSchema: Record<string, unknown>;
  };
  /**
   * When true, skip the process-wide V2_GEN_PROVIDER=deepinfra fork
   * (per-job routing handles openai-compatible separately).
   */
  skipProviderFork?: boolean;
};

function usageFromMessage(msg: Anthropic.Message): ClaudeTokenUsage {
  const u = msg.usage as Anthropic.Usage & {
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  return {
    input_tokens: u?.input_tokens ?? 0,
    output_tokens: u?.output_tokens ?? 0,
    cache_creation_input_tokens: u?.cache_creation_input_tokens,
    cache_read_input_tokens: u?.cache_read_input_tokens,
  };
}

function logCall(
  label: string | undefined,
  durationMs: number,
  usage: ClaudeTokenUsage | undefined,
  extras?: { stopReason?: string | null; maxTokens?: number },
): void {
  const u = usage ?? { input_tokens: 0, output_tokens: 0 };
  const cache =
    u.cache_read_input_tokens || u.cache_creation_input_tokens
      ? ` cache_read=${u.cache_read_input_tokens ?? 0} cache_create=${u.cache_creation_input_tokens ?? 0}`
      : '';
  const stop = extras?.stopReason ? ` stop=${extras.stopReason}` : '';
  const max =
    extras?.maxTokens != null
      ? ` max=${extras.maxTokens}`
      : '';
  console.info(
    `[v2-gen:call] ${label ?? 'claude'} ${durationMs}ms in=${u.input_tokens} out=${u.output_tokens}${max}${stop}${cache}`,
  );
  if (
    extras?.maxTokens != null &&
    extras.maxTokens > 0 &&
    u.output_tokens >= extras.maxTokens * 0.95
  ) {
    console.warn(
      `[v2-gen:call] near_max_tokens label=${label ?? 'claude'} out=${u.output_tokens} max=${extras.maxTokens}`,
    );
  }
}

/** Streaming is required for high max_tokens / long generations. */
async function createMessageStreaming(
  client: Anthropic,
  params: {
    model: string;
    max_tokens: number;
    system: string | ClaudeSystemBlock[];
    messages: Anthropic.MessageParam[];
    tools?: Anthropic.MessageCreateParams['tools'];
    tool_choice?: Anthropic.MessageCreateParams['tool_choice'];
  },
): Promise<Anthropic.Message> {
  return client.messages
    .stream({
      model: params.model,
      max_tokens: params.max_tokens,
      system: params.system as Anthropic.MessageCreateParams['system'],
      messages: params.messages,
      ...(params.tools ? { tools: params.tools } : {}),
      ...(params.tool_choice ? { tool_choice: params.tool_choice } : {}),
    })
    .finalMessage();
}

async function repairJson(
  client: Anthropic,
  model: string,
  broken: string,
  parseError: string,
): Promise<{ text: string; usage: ClaudeTokenUsage }> {
  repairFallbackCount += 1;
  console.info(
    `[v2-gen:json] repair_fallback total=${repairFallbackCount} parse_error=${parseError}`,
  );
  const msg = await createMessageStreaming(client, {
    model,
    max_tokens: Math.min(defaultMaxTokens(), 32_000),
    system: `${JSON_OUTPUT_RULES}

You fix broken JSON. Return only the corrected JSON object.`,
    messages: [
      {
        role: 'user',
        content: `This text was meant to be one JSON object but failed to parse (${parseError}).
Return the same content as valid JSON only. Close any truncated arrays/objects. Do not add commentary.

BROKEN:
${broken.slice(0, 120_000)}`,
      },
    ],
  });
  const block = msg.content?.find((b) => b.type === 'text');
  if (!block || block.type !== 'text' || !block.text) {
    throw new Error('JSON repair returned empty response');
  }
  return { text: block.text, usage: usageFromMessage(msg) };
}

export type ClaudeJsonResult = {
  data: unknown;
  model: string;
  durationMs: number;
  usage?: ClaudeTokenUsage;
  label?: string;
};

function buildSystemParam(
  systemPrompt: string,
  systemBlocks?: ClaudeSystemBlock[],
): string | ClaudeSystemBlock[] {
  if (systemBlocks && systemBlocks.length > 0) {
    const hasRules = systemBlocks.some((b) => b.text.includes('JSON OUTPUT RULES'));
    if (hasRules) return systemBlocks;
    return [
      ...systemBlocks,
      { type: 'text', text: JSON_OUTPUT_RULES },
    ];
  }
  return `${systemPrompt.trim()}

${JSON_OUTPUT_RULES}`;
}

function toolUseInput(msg: Anthropic.Message, toolName?: string): unknown | null {
  const blocks = msg.content ?? [];
  for (const b of blocks) {
    if (b.type !== 'tool_use') continue;
    if (toolName && b.name !== toolName) continue;
    return b.input;
  }
  return null;
}

function textFromMessage(msg: Anthropic.Message): string | null {
  const block = msg.content?.find((b) => b.type === 'text');
  if (!block || block.type !== 'text' || !block.text) return null;
  return block.text;
}

async function parseWithRepairFallback(
  client: Anthropic,
  model: string,
  text: string,
  label: string | undefined,
  started: number,
  usage: ClaudeTokenUsage,
  tokens: number,
): Promise<ClaudeJsonResult> {
  try {
    return {
      data: extractJson(text),
      model,
      durationMs: Date.now() - started,
      usage,
      label,
    };
  } catch (firstErr) {
    const parseError = firstErr instanceof Error ? firstErr.message : String(firstErr);
    console.info(
      `[v2-gen:json] label=${label ?? 'claude'} parse_error=${parseError} repairing`,
    );
    const repaired = await repairJson(client, model, text, parseError);
    const mergedUsage: ClaudeTokenUsage = {
      input_tokens: usage.input_tokens + repaired.usage.input_tokens,
      output_tokens: usage.output_tokens + repaired.usage.output_tokens,
      cache_creation_input_tokens:
        (usage.cache_creation_input_tokens ?? 0) +
        (repaired.usage.cache_creation_input_tokens ?? 0),
      cache_read_input_tokens:
        (usage.cache_read_input_tokens ?? 0) +
        (repaired.usage.cache_read_input_tokens ?? 0),
    };
    const durationMs = Date.now() - started;
    logCall(label ? `${label}:repair` : 'claude:repair', durationMs, mergedUsage, {
      maxTokens: tokens,
    });
    return {
      data: extractJson(repaired.text),
      model,
      durationMs,
      usage: mergedUsage,
      label,
    };
  }
}

export async function callClaudeJson(
  systemPrompt: string,
  userPrompt: string,
  opts: CallClaudeJsonOptions = {},
): Promise<ClaudeJsonResult> {
  // Legacy process-wide DeepInfra fork (prefer per-job openai-compatible routing).
  if (!opts.skipProviderFork) {
    const { isDeepinfraGenEnabled, callDeepinfraJson } = await import(
      './deepinfraClient'
    );
    if (isDeepinfraGenEnabled()) {
      return callDeepinfraJson(systemPrompt, userPrompt, opts);
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY or CLAUDE_API_KEY is not set');
  }
  const model = getClaudeModel(opts.model);
  const tokens = opts.maxTokens ?? defaultMaxTokens();
  const started = Date.now();
  const client = new Anthropic({ apiKey });
  const system = buildSystemParam(systemPrompt, opts.systemBlocks);

  const noForcedTool = forcedToolChoiceUnsupported(model);
  // Zod→JSON Schema often lacks additionalProperties:false, so skip strict tools.
  // 5.5: tool_choice auto + prompt; older models: forced tool_choice type "tool".
  const tools: Anthropic.MessageCreateParams['tools'] | undefined = opts.tool
    ? [
        {
          name: opts.tool.name,
          description:
            opts.tool.description ??
            'Submit the structured JSON result for this stage. Call exactly once.',
          input_schema: opts.tool.inputSchema as Anthropic.Tool.InputSchema,
        },
      ]
    : undefined;
  const tool_choice: Anthropic.MessageCreateParams['tool_choice'] | undefined =
    opts.tool
      ? noForcedTool
        ? { type: 'auto', disable_parallel_tool_use: true }
        : {
            type: 'tool',
            name: opts.tool.name,
            disable_parallel_tool_use: true,
          }
      : undefined;

  const userContent =
    opts.tool && noForcedTool
      ? `${userPrompt}\n\nYou must call the \`${opts.tool.name}\` tool exactly once with the full result. Do not reply with plain text.`
      : userPrompt;

  const msg = await createMessageStreaming(client, {
    model,
    max_tokens: tokens,
    system,
    messages: [{ role: 'user', content: userContent }],
    tools,
    tool_choice,
  });

  let usage = usageFromMessage(msg);
  const durationSoFar = Date.now() - started;
  logCall(opts.label, durationSoFar, usage, {
    stopReason: msg.stop_reason,
    maxTokens: tokens,
  });

  if (msg.stop_reason === 'max_tokens') {
    throw new Error(
      `Claude hit max_tokens (${tokens}). Increase CLAUDE_MAX_TOKENS or shorten the pack.`,
    );
  }

  const toolInput = toolUseInput(msg, opts.tool?.name);
  if (toolInput != null && typeof toolInput === 'object') {
    return {
      data: toolInput,
      model,
      durationMs: Date.now() - started,
      usage,
      label: opts.label,
    };
  }
  if (typeof toolInput === 'string') {
    return parseWithRepairFallback(
      client,
      model,
      toolInput,
      opts.label,
      started,
      usage,
      tokens,
    );
  }

  const text = textFromMessage(msg);
  if (!text) {
    throw new Error('Unexpected Claude response shape (no tool_use or text)');
  }

  return parseWithRepairFallback(
    client,
    model,
    text,
    opts.label,
    started,
    usage,
    tokens,
  );
}

export { JSON_OUTPUT_RULES };
