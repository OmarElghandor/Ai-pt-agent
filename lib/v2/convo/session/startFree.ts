import { randomUUID } from 'node:crypto';
import {
  freeTopicById,
  loadTopicAngles,
  type FreeTopic,
  type TopicAngle,
  type TopicAnglesDoc,
} from '@/lib/v2/convo/topics';
import {
  buildFreeOpeningBubbles,
  createFreeConvoSessionDoc,
  freePackId,
} from './freeInit';
import { buildFreeReopening } from './reopenFree';
import type { ConvoSessionStore } from './store';
import type { ConvoSession, StartConvoResult } from './types';

export type StartFreeConvoSessionOpts = {
  userId: string;
  topicId: string;
  store: ConvoSessionStore;
  sessionId?: string;
  newId?: () => string;
  now?: Date;
  /** Inject angles (tests). */
  anglesDoc?: TopicAnglesDoc;
  topic?: FreeTopic;
  suggestedWords?: string[];
};

function angleTl(
  angles: TopicAngle[],
  pendingId: string | undefined,
): string {
  if (!pendingId) return '';
  return angles.find((a) => a.id === pendingId)?.tl ?? '';
}

async function resumeFree(
  existing: ConvoSession,
  topic: FreeTopic,
  angles: TopicAngle[],
  store: ConvoSessionStore,
): Promise<StartConvoResult> {
  // Returning from a paused lesson conversation (T7.5).
  const cleared =
    existing.paused_for_pack_id != null
      ? { ...existing, paused_for_pack_id: null }
      : existing;
  if (cleared.pending_question) {
    const built = buildFreeReopening(cleared, topic, angles);
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
    opening: buildFreeOpeningBubbles(topic, angles[existing.angle_index] ?? null),
    resumed: true,
  };
}

/**
 * Create or resume a Module C free-chat session (T7.2).
 * No model call. Opening is a template + first angle as pending.
 */
export async function startFreeConvoSession(
  opts: StartFreeConvoSessionOpts,
): Promise<StartConvoResult> {
  const topic = opts.topic ?? freeTopicById(opts.topicId);
  if (!topic) throw new Error(`Unknown free topic: ${opts.topicId}`);

  const anglesDoc =
    opts.anglesDoc ?? loadTopicAngles(topic.id);
  const angles = anglesDoc.angles;
  const packId = freePackId(topic.id);

  if (opts.sessionId) {
    const existing = await opts.store.findById(opts.sessionId);
    if (
      existing &&
      existing.user_id === opts.userId &&
      existing.module === 'free' &&
      existing.topic_id === topic.id
    ) {
      return resumeFree(existing, topic, angles, opts.store);
    }
  }

  const open = await opts.store.findOpen(opts.userId, packId);
  if (open && open.module === 'free') {
    return resumeFree(open, topic, angles, opts.store);
  }

  const id = opts.newId?.() ?? randomUUID();
  const created = createFreeConvoSessionDoc({
    id,
    userId: opts.userId,
    topic,
    angles,
    now: opts.now,
    ...(opts.suggestedWords
      ? { suggestedWords: opts.suggestedWords }
      : {}),
  });
  const session = await opts.store.create(created);
  const first = angles[0] ?? null;
  const opening = buildFreeOpeningBubbles(topic, first);
  // Surface the first angle as character follow-up text in opening.character
  // when we already set pending; TalkSession shows pending from start payload.
  void angleTl;
  return {
    session,
    opening,
    resumed: false,
  };
}
