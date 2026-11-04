import { randomUUID } from 'node:crypto';
import type { ConvoPackData } from '@/lib/v2/convo/pack';
import { buildOpeningBubbles, createConvoSessionDoc } from './init';
import type { ConvoSessionStore } from './store';
import type { ConvoSession, StartConvoResult } from './types';

export type StartConvoSessionOpts = {
  userId: string;
  pack: ConvoPackData;
  store: ConvoSessionStore;
  /** Reload an existing session by id (must belong to userId). */
  sessionId?: string;
  /** Override id generator (tests). */
  newId?: () => string;
  now?: Date;
};

/**
 * Create or load a conversation session for user × pack.
 * No model call. Returns opening bubbles (character + group-1 coach intros/cards).
 */
export async function startConvoSession(
  opts: StartConvoSessionOpts,
): Promise<StartConvoResult> {
  const opening = buildOpeningBubbles(opts.pack);

  if (opts.sessionId) {
    const existing = await opts.store.findById(opts.sessionId);
    if (
      existing &&
      existing.user_id === opts.userId &&
      existing.pack_id === opts.pack.pack_id
    ) {
      return { session: existing, opening, resumed: true };
    }
  }

  const open = await opts.store.findOpen(opts.userId, opts.pack.pack_id);
  if (open) {
    return { session: open, opening, resumed: true };
  }

  const id = opts.newId?.() ?? randomUUID();
  const created = createConvoSessionDoc({
    id,
    userId: opts.userId,
    pack: opts.pack,
    now: opts.now,
  });
  const session = await opts.store.create(created);
  return { session, opening, resumed: false };
}

/** Reload a session by id; returns null if missing or wrong user. */
export async function getConvoSession(
  store: ConvoSessionStore,
  opts: { sessionId: string; userId: string },
): Promise<ConvoSession | null> {
  const session = await store.findById(opts.sessionId);
  if (!session || session.user_id !== opts.userId) return null;
  return session;
}
