import { randomUUID } from 'node:crypto';
import {
  V2RoleplaySessionModel,
  V2RoleplayStarsModel,
} from '@/lib/v2/mongo/roleplayModels';
import type { RoleplaySessionState } from './session';
import type { RoleplayTier } from './types';

export type RoleplaySessionStore = {
  get(sessionId: string, userId: string): Promise<RoleplaySessionState | null>;
  save(state: RoleplaySessionState): Promise<void>;
  findActive(
    userId: string,
    situationId: string,
    tier: RoleplayTier,
  ): Promise<RoleplaySessionState | null>;
};

export type RoleplayStarsStore = {
  getStars(
    userId: string,
    situationId: string,
  ): Promise<RoleplayTier[]>;
  getAllStars(
    userId: string,
  ): Promise<Record<string, RoleplayTier[]>>;
  awardStar(
    userId: string,
    situationId: string,
    tier: RoleplayTier,
  ): Promise<RoleplayTier[]>;
};

function docToState(doc: {
  _id: string;
  user_id: string;
  situation_id: string;
  tier: number;
  current_step_id?: string | null;
  slots?: Record<string, string>;
  misses?: Record<string, number>;
  alone_steps?: string[];
  assisted_steps?: string[];
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
    tier: doc.tier as RoleplayTier,
    current_step_id: doc.current_step_id ?? null,
    slots: { ...(doc.slots ?? {}) },
    misses: { ...(doc.misses ?? {}) },
    alone_steps: [...(doc.alone_steps ?? [])],
    assisted_steps: [...(doc.assisted_steps ?? [])],
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
    tier: RoleplayTier,
  ): Promise<RoleplaySessionState | null> {
    for (const s of this.byId.values()) {
      if (
        s.user_id === userId &&
        s.situation_id === situationId &&
        s.tier === tier &&
        s.status === 'active'
      ) {
        return structuredClone(s);
      }
    }
    return null;
  }
}

export class MemoryRoleplayStarsStore implements RoleplayStarsStore {
  private map = new Map<string, RoleplayTier[]>();

  private key(userId: string, situationId: string): string {
    return `${userId}::${situationId}`;
  }

  async getStars(
    userId: string,
    situationId: string,
  ): Promise<RoleplayTier[]> {
    return [...(this.map.get(this.key(userId, situationId)) ?? [])];
  }

  async getAllStars(
    userId: string,
  ): Promise<Record<string, RoleplayTier[]>> {
    const out: Record<string, RoleplayTier[]> = {};
    for (const [k, v] of this.map) {
      if (k.startsWith(`${userId}::`)) {
        out[k.slice(userId.length + 2)] = [...v];
      }
    }
    return out;
  }

  async awardStar(
    userId: string,
    situationId: string,
    tier: RoleplayTier,
  ): Promise<RoleplayTier[]> {
    const k = this.key(userId, situationId);
    const cur = new Set(this.map.get(k) ?? []);
    cur.add(tier);
    const next = [...cur].sort() as RoleplayTier[];
    this.map.set(k, next);
    return next;
  }
}

export class MongoRoleplaySessionStore implements RoleplaySessionStore {
  async get(
    sessionId: string,
    userId: string,
  ): Promise<RoleplaySessionState | null> {
    const doc = await V2RoleplaySessionModel().findOne({
      _id: sessionId,
      user_id: userId,
    }).lean();
    if (!doc) return null;
    return docToState(doc as never);
  }

  async save(state: RoleplaySessionState): Promise<void> {
    await V2RoleplaySessionModel().findOneAndUpdate(
      { _id: state.id, user_id: state.user_id },
      {
        $set: {
          situation_id: state.situation_id,
          tier: state.tier,
          current_step_id: state.current_step_id,
          slots: state.slots,
          misses: state.misses,
          alone_steps: state.alone_steps,
          assisted_steps: state.assisted_steps,
          key_phrases_said: state.key_phrases_said,
          gender: state.gender,
          learner_name: state.learner_name,
          status: state.status,
          exchanges: state.exchanges,
          corrections: state.corrections,
          model_calls: state.model_calls,
        },
        $setOnInsert: { _id: state.id, user_id: state.user_id },
      },
      { upsert: true },
    );
  }

  async findActive(
    userId: string,
    situationId: string,
    tier: RoleplayTier,
  ): Promise<RoleplaySessionState | null> {
    const doc = await V2RoleplaySessionModel().findOne({
      user_id: userId,
      situation_id: situationId,
      tier,
      status: 'active',
    }).lean();
    if (!doc) return null;
    return docToState(doc as never);
  }
}

export class MongoRoleplayStarsStore implements RoleplayStarsStore {
  async getStars(
    userId: string,
    situationId: string,
  ): Promise<RoleplayTier[]> {
    const doc = await V2RoleplayStarsModel()
      .findOne({ user_id: userId, situation_id: situationId })
      .lean();
    return ((doc?.stars ?? []) as number[]).filter(
      (n): n is RoleplayTier => n === 1 || n === 2 || n === 3,
    );
  }

  async getAllStars(
    userId: string,
  ): Promise<Record<string, RoleplayTier[]>> {
    const docs = await V2RoleplayStarsModel().find({ user_id: userId }).lean();
    const out: Record<string, RoleplayTier[]> = {};
    for (const d of docs) {
      out[d.situation_id] = ((d.stars ?? []) as number[]).filter(
        (n): n is RoleplayTier => n === 1 || n === 2 || n === 3,
      );
    }
    return out;
  }

  async awardStar(
    userId: string,
    situationId: string,
    tier: RoleplayTier,
  ): Promise<RoleplayTier[]> {
    const doc = await V2RoleplayStarsModel().findOneAndUpdate(
      { user_id: userId, situation_id: situationId },
      { $addToSet: { stars: tier } },
      { upsert: true, new: true },
    ).lean();
    return ((doc?.stars ?? [tier]) as number[]).filter(
      (n): n is RoleplayTier => n === 1 || n === 2 || n === 3,
    );
  }
}

export function newRoleplaySessionId(): string {
  return randomUUID();
}

export function encodeRoleplayTurnEvent(event: unknown): string {
  return `${JSON.stringify(event)}\n`;
}
