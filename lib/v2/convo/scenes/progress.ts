import type { ConvoSession, ConvoSessionStore } from '@/lib/v2/convo/session';

function isSceneTopicId(topicId: string | null | undefined): boolean {
  return Boolean(topicId?.startsWith('cena-'));
}

/** Finished scene topic ids for a learner (free-talk sessions status=done). */
export async function listFinishedSceneIds(
  store: ConvoSessionStore,
  userId: string,
): Promise<string[]> {
  if (typeof (store as SceneProgressStore).listFinishedSceneIds === 'function') {
    return (store as SceneProgressStore).listFinishedSceneIds!(userId);
  }
  return [];
}

/** Open scene sessions keyed by topic id. */
export async function listActiveScenesByTopic(
  store: ConvoSessionStore,
  userId: string,
): Promise<Record<string, { id: string }>> {
  if (typeof (store as SceneProgressStore).listActiveScenesByTopic === 'function') {
    return (store as SceneProgressStore).listActiveScenesByTopic!(userId);
  }
  return {};
}

export type SceneProgressStore = ConvoSessionStore & {
  listFinishedSceneIds?(userId: string): Promise<string[]>;
  listActiveScenesByTopic?(
    userId: string,
  ): Promise<Record<string, { id: string }>>;
};

/** Helpers used by MemoryConvoSessionStore (scan in-memory sessions). */
export function finishedSceneIdsFromSessions(
  sessions: Iterable<ConvoSession>,
  userId: string,
): string[] {
  const ids = new Set<string>();
  for (const s of sessions) {
    if (
      s.user_id === userId &&
      s.module === 'free' &&
      s.status === 'done' &&
      isSceneTopicId(s.topic_id)
    ) {
      ids.add(s.topic_id!);
    }
  }
  return [...ids];
}

export function activeScenesFromSessions(
  sessions: Iterable<ConvoSession>,
  userId: string,
): Record<string, { id: string }> {
  const out: Record<string, { id: string }> = {};
  for (const s of sessions) {
    if (
      s.user_id === userId &&
      s.module === 'free' &&
      s.status === 'open' &&
      isSceneTopicId(s.topic_id) &&
      s.pack_id === `free.${s.topic_id}`
    ) {
      out[s.topic_id!] = { id: s.id };
    }
  }
  return out;
}
