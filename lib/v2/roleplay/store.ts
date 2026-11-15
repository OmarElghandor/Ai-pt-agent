import { randomUUID } from 'node:crypto';
import { V2RoleplaySessionModel } from '@/lib/v2/mongo/roleplayModels';
import type { RoleplaySessionState } from './session';

export type RoleplaySessionStore = {
  get(sessionId: string, userId: string): Promise<RoleplaySessionState | null>;
  save(state: RoleplaySessionState): Promise<void>;
  findActive(
    userId: string,
    situationId: string,
  ): Promise<RoleplaySessionState | null>;
  /** Situation ids with at least one done session. */
  listFinishedSituationIds(userId: string): Promise<string[]>;
  /** Active sessions keyed by situation id. */
  listActiveBySituation(
    userId: string,
  ): Promise<Record<string, RoleplaySessionState>>;
};

function docToState(doc: {
  _id: string;
  user_id: string;
  situation_id: string;
  current_step_id?: string | null;
  slots?: Record<string, string>;
  misses?: Record<string, number>;
  alone_steps?: string[];
  assisted_steps?: string[];
  pending_assist?: string | null;
  key_phrases_said?: string[];
  gender?: 'm' | 'f';
  learner_name?: string | null;
  status: 'active' | 'done';
  exchanges?: RoleplaySessionState['exchanges'];
  corrections?: RoleplaySessionState['corrections'];
  model_calls?: number;
  createdAt?: Date;
  updatedAt?: Date;
}): RoleplaySessionState {
  return {
    id: doc._id,
    user_id: doc.user_id,
    situation_id: doc.situation_id,
    current_step_id: doc.current_step_id ?? null,
    slots: { ...(doc.slots ?? {}) },
    misses: { ...(doc.misses ?? {}) },
    alone_steps: [...(doc.alone_steps ?? [])],
    assisted_steps: [...(doc.assisted_steps ?? [])],
    pending_assist: doc.pending_assist ?? null,
    key_phrases_said: [...(doc.key_phrases_said ?? [])],
    gender: doc.gender === 'f' ? 'f' : 'm',
    learner_name: doc.learner_name ?? null,
    status: doc.status,
    exchanges: [...(doc.exchanges ?? [])],
    corrections: [...(doc.corrections ?? [])],
    model_calls: doc.model_calls ?? 0,
    created_at: (doc.createdAt ?? new Date()).toISOString(),
    updated_at: (doc.updatedAt ?? new Date()).toISOString(),
  };
}

export class MemoryRoleplaySessionStore implements RoleplaySessionStore {
  private byId = new Map<string, RoleplaySessionState>();

  async get(
    sessionId: string,
    userId: string,
  ): Promise<RoleplaySessionState | null> {
    const s = this.byId.get(sessionId);
    if (!s || s.user_id !== userId) return null;
    return structuredClone(s);
  }

  async save(state: RoleplaySessionState): Promise<void> {
    this.byId.set(state.id, structuredClone(state));
  }

  async findActive(
    userId: string,
    situationId: string,
  ): Promise<RoleplaySessionState | null> {
    for (const s of this.byId.values()) {
      if (
        s.user_id === userId &&
        s.situation_id === situationId &&
        s.status === 'active'
      ) {
        return structuredClone(s);
      }
    }
    return null;
  }

  async listFinishedSituationIds(userId: string): Promise<string[]> {
    const ids = new Set<string>();
    for (const s of this.byId.values()) {
      if (s.user_id === userId && s.status === 'done') {
        ids.add(s.situation_id);
      }
    }
    return [...ids];
  }

  async listActiveBySituation(
    userId: string,
  ): Promise<Record<string, RoleplaySessionState>> {
    const out: Record<string, RoleplaySessionState> = {};
    for (const s of this.byId.values()) {
      if (s.user_id === userId && s.status === 'active') {
        out[s.situation_id] = structuredClone(s);
      }
    }
    return out;
  }
}

export class MongoRoleplaySessionStore implements RoleplaySessionStore {
  async get(
    sessionId: string,
    userId: string,
  ): Promise<RoleplaySessionState | null> {
    const doc = await V2RoleplaySessionModel()
      .findOne({
        _id: sessionId,
        user_id: userId,
      })
      .lean();
    if (!doc) return null;
    return docToState(doc as never);
  }

  async save(state: RoleplaySessionState): Promise<void> {
    await V2RoleplaySessionModel().findOneAndUpdate(
      { _id: state.id, user_id: state.user_id },
      {
        $set: {
          situation_id: state.situation_id,
          current_step_id: state.current_step_id,
          slots: state.slots,
          misses: state.misses,
          alone_steps: state.alone_steps,
          assisted_steps: state.assisted_steps,
          pending_assist: state.pending_assist,
          key_phrases_said: state.key_phrases_said,
          gender: state.gender,
          learner_name: state.learner_name,
          status: state.status,
          exchanges: state.exchanges,
          corrections: state.corrections,
          model_calls: state.model_calls,
        },
        $setOnInsert: { _id: state.id, user_id: state.user_id },
        $unset: { tier: 1 },
      },
      { upsert: true },
    );
  }

  async findActive(
    userId: string,
    situationId: string,
  ): Promise<RoleplaySessionState | null> {
    const doc = await V2RoleplaySessionModel()
      .findOne({
        user_id: userId,
        situation_id: situationId,
        status: 'active',
      })
      .lean();
    if (!doc) return null;
    return docToState(doc as never);
  }

  async listFinishedSituationIds(userId: string): Promise<string[]> {
    const docs = await V2RoleplaySessionModel()
      .find({ user_id: userId, status: 'done' })
      .select({ situation_id: 1 })
      .lean();
    return [...new Set(docs.map((d) => d.situation_id as string))];
  }

  async listActiveBySituation(
    userId: string,
  ): Promise<Record<string, RoleplaySessionState>> {
    const docs = await V2RoleplaySessionModel()
      .find({ user_id: userId, status: 'active' })
      .lean();
    const out: Record<string, RoleplaySessionState> = {};
    for (const doc of docs) {
      const state = docToState(doc as never);
      out[state.situation_id] = state;
    }
    return out;
  }
}

export function newRoleplaySessionId(): string {
  return randomUUID();
}

export function encodeRoleplayTurnEvent(event: unknown): string {
  return `${JSON.stringify(event)}\n`;
}
