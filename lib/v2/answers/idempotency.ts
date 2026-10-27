import type { AnswerVerdict } from './evaluate';

/** In-memory store for unit tests. */
export class MemoryIdempotencyStore {
  private map = new Map<string, AnswerVerdict>();

  get(answerId: string): AnswerVerdict | undefined {
    return this.map.get(answerId);
  }

  set(answerId: string, verdict: AnswerVerdict): void {
    this.map.set(answerId, verdict);
  }

  clear(): void {
    this.map.clear();
  }
}

export const defaultMemoryIdempotency = new MemoryIdempotencyStore();

/**
 * Run evaluate once per answer_id. Duplicates return stored verdict without
 * calling `run` again.
 */
export async function withIdempotency(
  answerId: string,
  store: {
    get: (id: string) => Promise<AnswerVerdict | undefined> | AnswerVerdict | undefined;
    set: (id: string, v: AnswerVerdict) => Promise<void> | void;
  },
  run: () => Promise<AnswerVerdict>,
): Promise<AnswerVerdict> {
  const existing = await store.get(answerId);
  if (existing) {
    return { ...existing, duplicate: true };
  }
  const verdict = await run();
  const stored = { ...verdict, duplicate: false as const };
  await store.set(answerId, stored);
  return stored;
}
