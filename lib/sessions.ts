import type { CefrLevel } from './prompts';

export type SessionMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type Session = {
  id: string;
  level: CefrLevel;
  messages: SessionMessage[];
  createdAt: number;
  updatedAt: number;
};

type SessionStore = Map<string, Session>;

const globalForSessions = globalThis as typeof globalThis & {
  __ptChatSessions?: SessionStore;
};

function getStore(): SessionStore {
  if (!globalForSessions.__ptChatSessions) {
    globalForSessions.__ptChatSessions = new Map();
  }
  return globalForSessions.__ptChatSessions;
}

export function getSession(id: string): Session | undefined {
  return getStore().get(id);
}

export function getOrCreateSession(id: string, level: CefrLevel): Session {
  const store = getStore();
  const existing = store.get(id);
  if (existing) {
    if (existing.level !== level) {
      existing.level = level;
      existing.updatedAt = Date.now();
    }
    return existing;
  }
  const session: Session = {
    id,
    level,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  store.set(id, session);
  return session;
}

export function appendMessage(id: string, msg: SessionMessage): void {
  const session = getStore().get(id);
  if (!session) {
    throw new Error(`Session not found: ${id}`);
  }
  session.messages.push(msg);
  session.updatedAt = Date.now();
}

export function resetSession(id: string, level: CefrLevel): Session {
  const store = getStore();
  const session: Session = {
    id,
    level,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  store.set(id, session);
  return session;
}
