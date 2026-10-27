import type { ItemState, ProgressError } from '@/lib/v2/progress/types';
import type { AnswerVerdict } from './evaluate';

/** Injectable persistence for answers.handle — in-memory in tests, Mongo in routes. */
export type AnswersStore = {
  getIdempotent(answerId: string): Promise<AnswerVerdict | null>;
  saveIdempotent(answerId: string, userId: string, verdict: AnswerVerdict): Promise<void>;
  getItemState(userId: string, itemId: string): Promise<ItemState | null>;
  saveItemState(state: ItemState): Promise<void>;
  appendError(err: ProgressError): Promise<void>;
  listRecentErrors(userId: string, limit: number): Promise<ProgressError[]>;
};

export function createMemoryStore(): AnswersStore & {
  states: Map<string, ItemState>;
  errors: ProgressError[];
  idem: Map<string, AnswerVerdict>;
} {
  const states = new Map<string, ItemState>();
  const errors: ProgressError[] = [];
  const idem = new Map<string, AnswerVerdict>();
  const key = (u: string, i: string) => `${u}::${i}`;

  return {
    states,
    errors,
    idem,
    async getIdempotent(answerId) {
      return idem.get(answerId) ?? null;
    },
    async saveIdempotent(answerId, _userId, verdict) {
      idem.set(answerId, verdict);
    },
    async getItemState(userId, itemId) {
      return states.get(key(userId, itemId)) ?? null;
    },
    async saveItemState(state) {
      states.set(key(state.user_id, state.item_id), state);
    },
    async appendError(err) {
      errors.push(err);
    },
    async listRecentErrors(userId, limit) {
      return errors.filter((e) => e.user_id === userId).slice(-limit);
    },
  };
}
