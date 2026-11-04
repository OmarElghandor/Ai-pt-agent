import { loadTopicsFile } from './load';
import { loadFreeTopicsFile } from './threadLoad';

/**
 * Map a lesson pack / topic to a free-chat topic id (T7.5).
 * Prefer explicit free_topic_id on the topics file; fall back to heuristics.
 * Batch 9 topic ids: casa, comida, ontem, …
 */
export function freeTopicIdForPack(packId: string): string | null {
  const file = loadTopicsFile();
  for (const theme of file.themes) {
    for (const topic of theme.topics) {
      if (topic.pack_id !== packId) continue;
      const explicit = (topic as { free_topic_id?: string }).free_topic_id;
      if (explicit) return explicit;
      if (theme.id === 'directions') return 'casa';
      if (theme.id === 'cafe') return 'comida';
      if (theme.id === 'feelings') return 'ontem';
    }
  }
  const free = loadFreeTopicsFile();
  return free.topics[0]?.id ?? null;
}

export function freeTopicIdForLessonTopic(
  topicId: string,
): string | null {
  const file = loadTopicsFile();
  for (const theme of file.themes) {
    for (const topic of theme.topics) {
      if (topic.id !== topicId) continue;
      const explicit = (topic as { free_topic_id?: string }).free_topic_id;
      if (explicit) return explicit;
      return freeTopicIdForPack(topic.pack_id);
    }
  }
  return null;
}
