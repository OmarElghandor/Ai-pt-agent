import Anthropic from '@anthropic-ai/sdk';

const JSON_OUTPUT_RULES = `
JSON OUTPUT RULES (mandatory)
- Reply with ONE JSON object only. No markdown fences, no commentary before or after.
- Valid JSON: double-quoted keys and strings, commas between elements, no trailing commas.
- Escape every " inside string values as \\". No raw newlines inside strings (use \\n).
- Do not truncate. Finish every array and object. The response must parse with JSON.parse.
`.trim();

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

function getClaudeModel(): string {
  return process.env.CLAUDE_MODEL?.trim() || 'claude-sonnet-5-5';
}

function defaultMaxTokens(): number {
  const n = Number(process.env.CLAUDE_MAX_TOKENS);
  return Number.isFinite(n) && n > 0 ? n : 24_000;
}

/** Streaming is required for high max_tokens / long generations. */
async function createMessageStreaming(
  client: Anthropic,
  params: {
    model: string;
    max_tokens: number;
    system: string;
    messages: Anthropic.MessageParam[];
  },
): Promise<Anthropic.Message> {
  return client.messages
    .stream({
      model: params.model,
      max_tokens: params.max_tokens,
      system: params.system,
      messages: params.messages,
    })
    .finalMessage();
}

async function repairJson(
  client: Anthropic,
  model: string,
  broken: string,
  parseError: string,
): Promise<string> {
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
  return block.text;
}

export async function callClaudeJson(
  systemPrompt: string,
  userPrompt: string,
  { maxTokens }: { maxTokens?: number } = {},
): Promise<{ data: unknown; model: string; durationMs: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY or CLAUDE_API_KEY is not set');
  }
  const model = getClaudeModel();
  const tokens = maxTokens ?? defaultMaxTokens();
  const started = Date.now();
  const client = new Anthropic({ apiKey });

  const system = `${systemPrompt.trim()}

${JSON_OUTPUT_RULES}`;

  const msg = await createMessageStreaming(client, {
    model,
    max_tokens: tokens,
    system,
    messages: [{ role: 'user', content: userPrompt }],
  });

  if (msg.stop_reason === 'max_tokens') {
    throw new Error(
      `Claude hit max_tokens (${tokens}). Increase CLAUDE_MAX_TOKENS or shorten the pack.`,
    );
  }

  const block = msg.content?.find((b) => b.type === 'text');
  if (!block || block.type !== 'text' || !block.text) {
    throw new Error('Unexpected Claude response shape');
  }

  let text = block.text;
  try {
    return {
      data: extractJson(text),
      model,
      durationMs: Date.now() - started,
    };
  } catch (firstErr) {
    const parseError = firstErr instanceof Error ? firstErr.message : String(firstErr);
    text = await repairJson(client, model, text, parseError);
    return {
      data: extractJson(text),
      model,
      durationMs: Date.now() - started,
    };
  }
}

export { JSON_OUTPUT_RULES };
