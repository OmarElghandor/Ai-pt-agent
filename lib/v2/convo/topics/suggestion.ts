import type { TopicRow } from './types';

/**
 * Egyptian home-card line for a 🟡 topic (09 §8).
 * Example: "الاتجاهات محتاجة مراجعة، تتكلم مع Inês؟"
 */
export function topicReviewSuggestionEg(topic: {
  title_ar: string;
  character_name?: string;
}): string {
  const name = topic.character_name?.trim() || 'Inês';
  return `${topic.title_ar} محتاجة مراجعة، تتكلم مع ${name}؟`;
}

export function talkHrefForTopic(topic: Pick<TopicRow, 'pack_id'>): string {
  return `/talk/${encodeURIComponent(topic.pack_id)}`;
}
