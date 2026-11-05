import { randomUUID } from 'node:crypto';
import { getLangifyUserFirstName } from '@/lib/langifyRead';
import {
  freeTopicById,
  isOpenTopicId,
  loadThreadTopic,
  type FreeTopic,
} from '@/lib/v2/convo/topics';
import { currentNextLine } from '@/lib/v2/convo/free/nextLine';
import {
  buildFreeOpeningBubbles,
  createFreeConvoSessionDoc,
  freePackId,
} from './freeInit';
import { buildFreeReopening } from './reopenFree';
import { loadSuggestedSurfacesForUser } from './suggestedWords';
import type { ConvoSessionStore } from './store';
import type { ConvoSession, StartConvoResult } from './types';

export type StartFreeConvoSessionOpts = {
  userId: string;
  topicId: string;
  store: ConvoSessionStore;
  sessionId?: string;
  newId?: () => string;
  now?: Date;
  topic?: FreeTopic;
  suggestedWords?: string[];
  /** Injected for tests; otherwise loaded from Langify users.name. */
  learnerName?: string | null;
};

async function resumeFree(
  existing: ConvoSession,
  topic: FreeTopic,
  store: ConvoSessionStore,
  learnerName?: string | null,
): Promise<StartConvoResult> {
  const cleared =
    existing.paused_for_pack_id != null
      ? { ...existing, paused_for_pack_id: null }
      : existing;
  if (cleared.pending_question && !isOpenTopicId(topic.id) && cleared.free_step.kind !== 'open') {
    const doc = loadThreadTopic(topic.id);
    const pending = currentNextLine(
      doc,
      cleared.thread_index,
      cleared.free_step,
      topic,
    );
    const built = buildFreeReopening(cleared, topic, pending.tl);
    const session = await store.save(built.session);
    return {
      session,
      opening: built.opening,
      resumed: true,
      reopening: built.reopening,
    };
  }
  const session =
    cleared !== existing ? await store.save(cleared) : cleared;
  return {
    session,
    opening: buildFreeOpeningBubbles(topic, { learnerName }),
    resumed: true,
  };
}

/**
 * Create or resume a Module C free-chat session (Batch 9).
 * No model call. Opening: coach intro_eg + one bubble (opening+share+ask).
 */
export async function startFreeConvoSession(
  opts: StartFreeConvoSessionOpts,
): Promise<StartConvoResult> {
  const topic = opts.topic ?? freeTopicById(opts.topicId);
  if (!topic) throw new Error(`Unknown free topic: ${opts.topicId}`);

  const packId = freePackId(topic.id);
  const learnerName =
    opts.learnerName !== undefined
      ? opts.learnerName
      : await getLangifyUserFirstName(opts.userId);

  if (opts.sessionId) {
    const existing = await opts.store.findById(opts.sessionId);
    if (
      existing &&
      existing.user_id === opts.userId &&
      existing.module === 'free' &&
      existing.topic_id === topic.id
    ) {
      return resumeFree(existing, topic, opts.store, learnerName);
    }
  }

  const open = await opts.store.findOpen(opts.userId, packId);
  if (open && open.module === 'free') {
    return resumeFree(open, topic, opts.store, learnerName);
  }

  const id = opts.newId?.() ?? randomUUID();
  let suggestedWords = opts.suggestedWords;
  if (suggestedWords === undefined && isOpenTopicId(topic.id)) {
    suggestedWords = await loadSuggestedSurfacesForUser(opts.userId);
  }
  const created = createFreeConvoSessionDoc({
    id,
    userId: opts.userId,
    topic,
    now: opts.now,
    ...(suggestedWords ? { suggestedWords } : {}),
  });
  const session = await opts.store.create(created);
  return {
    session,
    opening: buildFreeOpeningBubbles(topic, { learnerName }),
    resumed: false,
  };
}
