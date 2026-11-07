import type { ConvoSession } from './types';

export type ConvoSessionStore = {
  findById(id: string): Promise<ConvoSession | null>;
  findOpen(userId: string, packId: string): Promise<ConvoSession | null>;
  /** Open free-chat topic ids for a user (practice picker «كمّل»). */
  findOpenFreeTopicIds?(userId: string): Promise<string[]>;
  create(session: ConvoSession): Promise<ConvoSession>;
  save(session: ConvoSession): Promise<ConvoSession>;
  /** Delete open session(s) for user+pack so start can reopen fresh. */
  deleteOpen?(userId: string, packId: string): Promise<number>;
};

/** In-memory store for unit tests (no Mongo). */
export class MemoryConvoSessionStore implements ConvoSessionStore {
  private byId = new Map<string, ConvoSession>();

  async findById(id: string): Promise<ConvoSession | null> {
    return this.byId.get(id) ?? null;
  }

  async findOpen(
    userId: string,
    packId: string,
  ): Promise<ConvoSession | null> {
    for (const s of this.byId.values()) {
      if (
        s.user_id === userId &&
        s.pack_id === packId &&
        s.status === 'open'
      ) {
        return structuredClone(s);
      }
    }
    return null;
  }

  async findOpenFreeTopicIds(userId: string): Promise<string[]> {
    const ids: string[] = [];
    for (const s of this.byId.values()) {
      if (
        s.user_id === userId &&
        s.module === 'free' &&
        s.status === 'open' &&
        s.topic_id &&
        // Lesson-day sessions keep topic_id "open" but must not light «أي حاجة».
        !(typeof s.lesson_day === 'number' && s.lesson_day > 0) &&
        s.pack_id === `free.${s.topic_id}`
      ) {
        ids.push(s.topic_id);
      }
    }
    return ids;
  }

  async create(session: ConvoSession): Promise<ConvoSession> {
    const copy = structuredClone(session);
    this.byId.set(copy.id, copy);
    return structuredClone(copy);
  }

  async save(session: ConvoSession): Promise<ConvoSession> {
    const copy = structuredClone(session);
    this.byId.set(copy.id, copy);
    return structuredClone(copy);
  }

  async deleteOpen(userId: string, packId: string): Promise<number> {
    let n = 0;
    for (const [id, s] of this.byId) {
      if (
        s.user_id === userId &&
        s.pack_id === packId &&
        s.status === 'open'
      ) {
        this.byId.delete(id);
        n += 1;
      }
    }
    return n;
  }

  clear(): void {
    this.byId.clear();
  }
}
