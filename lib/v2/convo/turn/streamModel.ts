import { streamText } from 'ai';
import { getChatModel } from '@/lib/model';
import { estimateConvoPromptTokens } from '@/lib/v2/convo/prompt';
import type { ConvoStreamModel, ConvoStreamModelResult } from './types';

function withRegen(prompt: string, reason?: string): string {
  if (!reason) return prompt;
  return `${prompt}\n\n### regenerate\n${reason}`;
}

/**
 * Live model streamer (AI SDK + env chat model).
 * Prefer `stream` for tag-early handling; `complete` buffers.
 */
export function createLiveConvoStreamModel(): ConvoStreamModel {
  return {
    async complete(input) {
      return this.stream!({
        ...input,
      });
    },
    async stream(input) {
      const started = Date.now();
      let ttftMs = -1;
      let text = '';
      const result = streamText({
        model: getChatModel(),
        system: input.system,
        prompt: withRegen(input.prompt, input.regenerateReason),
        temperature: 0.4,
        maxOutputTokens: input.maxTokens ?? 48,
      });

      for await (const chunk of result.textStream) {
        if (ttftMs < 0) ttftMs = Date.now() - started;
        text += chunk;
        input.onChunk?.(chunk);
      }
      if (ttftMs < 0) ttftMs = Date.now() - started;

      const usage = await result.usage;
      return {
        text,
        ttftMs,
        usage: {
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          // Provider may not report cache hits; fall back to estimate later.
          cachedInputTokens: undefined,
        },
      };
    },
  };
}

/**
 * Deterministic stub for tests: returns a fixed `[id] reaction` string,
 * optionally split across onChunk callbacks.
 */
export function createStubConvoStreamModel(opts: {
  /** Map from first candidate id → full model output (tag + reaction). */
  byCandidate?: (candidateIds: string[], prompt: string) => string;
  /** Split output into these chunks when streaming (tests tag split). */
  chunks?: string[];
}): ConvoStreamModel & {
  lastPrompt: string | null;
  calls: number;
} {
  const state = { lastPrompt: null as string | null, calls: 0 };

  async function run(
    input: {
      system: string;
      prompt: string;
      regenerateReason?: string;
      onChunk?: (chunk: string) => void;
    },
    candidateIdsFromPrompt: string[],
  ): Promise<ConvoStreamModelResult> {
    state.calls += 1;
    state.lastPrompt = withRegen(input.prompt, input.regenerateReason);
    const text =
      opts.byCandidate?.(candidateIdsFromPrompt, state.lastPrompt) ??
      (candidateIdsFromPrompt[0]
        ? `[${candidateIdsFromPrompt[0]}] Perfeito!`
        : 'Perfeito!');
    const pieces =
      opts.chunks && opts.chunks.length > 0
        ? opts.chunks
        : [text];
    // If chunks provided as partials of a different string, prefer joining them.
    const joined = opts.chunks?.length ? opts.chunks.join('') : text;
    const started = Date.now();
    let ttftMs = -1;
    for (const piece of pieces) {
      if (ttftMs < 0) ttftMs = Date.now() - started;
      input.onChunk?.(piece);
    }
    if (ttftMs < 0) ttftMs = 0;
    const full = opts.chunks?.length ? joined : text;
    const inputTokens = estimateConvoPromptTokens(
      `${input.system}\n${input.prompt}`,
    );
    return {
      text: full,
      ttftMs,
      usage: {
        inputTokens,
        outputTokens: estimateConvoPromptTokens(full),
        cachedInputTokens: estimateConvoPromptTokens(input.system),
      },
    };
  }

  function parseCandidateIds(prompt: string): string[] {
    const block = prompt.match(/### 4\. candidates\n([\s\S]*?)(?=\n### |\n*$)/);
    if (!block) return [];
    const ids: string[] = [];
    for (const line of block[1].split('\n')) {
      const m = line.match(/^\[([^\]]+)\]/);
      if (m) ids.push(m[1]);
    }
    return ids;
  }

  const model: ConvoStreamModel & {
    lastPrompt: string | null;
    calls: number;
  } = {
    get lastPrompt() {
      return state.lastPrompt;
    },
    get calls() {
      return state.calls;
    },
    async complete(input) {
      return run(input, parseCandidateIds(input.prompt));
    },
    async stream(input) {
      return run(input, parseCandidateIds(input.prompt));
    },
  };
  return model;
}
