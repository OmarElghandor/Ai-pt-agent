import { streamText } from 'ai';
import {
  getConvoModel,
  parseConvoModelSpec,
} from '@/lib/model';
import { estimateUsd } from '@/lib/v2/generation/lesson/prices';
import { ROLEPLAY_ACTOR_SYSTEM } from './prompt';

export const ROLEPLAY_ACTOR_TIMEOUT_MS = 4000;
export const ROLEPLAY_ACTOR_MAX_TOKENS = 120;
export const ROLEPLAY_ACTOR_TEMPERATURE = 0.6;

export type RoleplayActorGenerateResult = {
  text: string;
  latencyMs: number;
  timedOut: boolean;
  inputTokens?: number;
  outputTokens?: number;
};

/**
 * One buffered character turn. Never streams tokens to the UI —
 * the engine shows a typing indicator until this resolves, then guards.
 */
export type RoleplayActor = {
  generate(prompt: string): Promise<RoleplayActorGenerateResult>;
};

export function createLiveRoleplayActor(opts?: {
  modelOverride?: string | null;
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
}): RoleplayActor {
  const timeoutMs = opts?.timeoutMs ?? ROLEPLAY_ACTOR_TIMEOUT_MS;
  const maxTokens = opts?.maxTokens ?? ROLEPLAY_ACTOR_MAX_TOKENS;
  const temperature = opts?.temperature ?? ROLEPLAY_ACTOR_TEMPERATURE;
  // Role-play defaults to Haiku until A/B settles (dev menu can still pass qwen).
  const modelOverride =
    opts?.modelOverride != null && String(opts.modelOverride).trim() !== ''
      ? opts.modelOverride
      : 'haiku';
  const spec = parseConvoModelSpec(modelOverride);

  return {
    async generate(prompt: string): Promise<RoleplayActorGenerateResult> {
      const started = Date.now();
      let timedOut = false;
      let text = '';
      let inputTokens: number | undefined;
      let outputTokens: number | undefined;

      const run = (async () => {
        const result = streamText({
          model: getConvoModel(modelOverride),
          system: ROLEPLAY_ACTOR_SYSTEM,
          prompt,
          temperature,
          maxOutputTokens: maxTokens,
        });
        // Buffer fully — do not expose chunks to callers.
        for await (const chunk of result.textStream) {
          text += chunk;
        }
        const usage = await result.usage;
        inputTokens = usage?.inputTokens;
        outputTokens = usage?.outputTokens;
        return text;
      })();

      const winner = await Promise.race([
        run.then((t) => ({ kind: 'ok' as const, t })),
        new Promise<{ kind: 'timeout' }>((resolve) => {
          setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs);
        }),
      ]);

      const latencyMs = Date.now() - started;
      if (winner.kind === 'timeout') {
        timedOut = true;
        console.info(
          JSON.stringify({
            tag: 'v2_roleplay_actor_cost',
            model: spec.modelId,
            label: spec.label,
            provider: spec.provider,
            timed_out: true,
            total_ms: latencyMs,
          }),
        );
        return { text: '', latencyMs, timedOut: true };
      }

      const usd = estimateUsd(spec.provider, spec.modelId, {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      });
      console.info(
        JSON.stringify({
          tag: 'v2_roleplay_actor_cost',
          model: spec.modelId,
          label: spec.label,
          provider: spec.provider,
          timed_out: false,
          total_ms: latencyMs,
          input_tokens: inputTokens ?? null,
          output_tokens: outputTokens ?? null,
          usd_estimate: usd,
        }),
      );
      return {
        text: winner.t,
        latencyMs,
        timedOut: false,
        inputTokens,
        outputTokens,
      };
    },
  };
}

export function createStubRoleplayActor(opts: {
  reply:
    | string
    | ((prompt: string) => string | Promise<string>);
  /** Artificial delay before resolving (ms). */
  delayMs?: number;
  /** Simulate the 4s timeout (empty text + timedOut). */
  timeout?: boolean;
}): RoleplayActor & { calls: number; lastPrompt: string | null } {
  const state = { calls: 0, lastPrompt: null as string | null };
  const actor: RoleplayActor & { calls: number; lastPrompt: string | null } = {
    get calls() {
      return state.calls;
    },
    get lastPrompt() {
      return state.lastPrompt;
    },
    async generate(prompt: string) {
      state.calls += 1;
      state.lastPrompt = prompt;
      const started = Date.now();
      if (opts.delayMs && opts.delayMs > 0) {
        await new Promise((r) => setTimeout(r, opts.delayMs));
      }
      if (opts.timeout) {
        return {
          text: '',
          latencyMs: Date.now() - started,
          timedOut: true,
        };
      }
      const text =
        typeof opts.reply === 'function'
          ? await opts.reply(prompt)
          : opts.reply;
      return {
        text,
        latencyMs: Date.now() - started,
        timedOut: false,
      };
    },
  };
  return actor;
}
