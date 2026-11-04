import { loadTopicsFile } from './load';
import { loadFreeTopicsFile } from './freeLoad';

/**
 * Map a lesson pack / topic to a free-chat topic id (T7.5).
 * Prefer explicit free_topic_id on the topics file; fall back to heuristics.
 */
export function freeTopicIdForPack(packId: string): string | null {
  const file = loadTopicsFile();
  for (const theme of file.themes) {
    for (const topic of theme.topics) {
      if (topic.pack_id !== packId) continue;
      const explicit = (topic as { free_topic_id?: string }).free_topic_id;
      if (explicit) return explicit;
      if (theme.id === 'directions') return 'home';
      if (theme.id === 'cafe') return 'food';
      if (theme.id === 'feelings') return 'day';
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
