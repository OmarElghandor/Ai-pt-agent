import { randomUUID } from 'node:crypto';
import type { ConvoPackData } from '@/lib/v2/convo/pack';
import { buildOpeningBubbles, createConvoSessionDoc } from './init';
import { buildReopening } from './reopen';
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

function resumeResult(
  existing: ConvoSession,
  pack: ConvoPackData,
  store: ConvoSessionStore,
): Promise<StartConvoResult> {
  if (existing.pending_question) {
    const built = buildReopening(existing, pack);
    return store.save(built.session).then((session) => ({
      session,
      opening: built.opening,
      resumed: true,
      reopening: built.reopening,
    }));
  }
  // Open session but no pending yet (left before first question) → fresh opening.
  return Promise.resolve({
    session: existing,
    opening: buildOpeningBubbles(pack),
    resumed: true,
  });
}

/**
 * Create or load a conversation session for user × pack.
 * No model call. Fresh start → opening bubbles; resume mid-run → template
 * reopening + pending question (T4.1).
 */
export async function startConvoSession(
  opts: StartConvoSessionOpts,
): Promise<StartConvoResult> {
  if (opts.sessionId) {
    const existing = await opts.store.findById(opts.sessionId);
    if (
      existing &&
      existing.user_id === opts.userId &&
      existing.pack_id === opts.pack.pack_id
    ) {
      return resumeResult(existing, opts.pack, opts.store);
    }
  }

  const open = await opts.store.findOpen(opts.userId, opts.pack.pack_id);
  if (open) {
    return resumeResult(open, opts.pack, opts.store);
  }

  const id = opts.newId?.() ?? randomUUID();
  const created = createConvoSessionDoc({
    id,
    userId: opts.userId,
    pack: opts.pack,
    now: opts.now,
  });
  const session = await opts.store.create(created);
  return {
    session,
    opening: buildOpeningBubbles(opts.pack),
    resumed: false,
  };
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
