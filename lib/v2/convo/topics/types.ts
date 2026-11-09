export type TopicStatus = 'solid' | 'needs_review' | 'not_tried';

export type TopicsFileTopic = {
  id: string;
  title_tl: string;
  title_ar: string;
  day: number;
  pack_id: string;
  item_ids: string[];
  character_id?: string;
  /** Free-chat topic to continue into after the lesson (T7.5). */
  free_topic_id?: string;
  /** Egyptian situation line (from the days plan). */
  subtitle_eg?: string;
};

export type TopicsFileTheme = {
  id: string;
  title_tl: string;
  title_ar: string;
  topics: TopicsFileTopic[];
};

export type TopicsFile = {
  target_lang: string;
  themes: TopicsFileTheme[];
};

/** Chip on Learn cards when the day isn't fully ready (P5). */
export type TopicReadyChip = 'preparing' | 'soon' | null;

export type TopicRow = TopicsFileTopic & {
  unlocked: boolean;
  pack_available: boolean;
  status: TopicStatus;
  /** Display glyph matching 09 §8. */
  status_glyph: '🟢' | '🟡' | '⚪';
  /** Display name for home suggestion copy (from characters.json). */
  character_name?: string;
  /**
   * When set, the day needs preparation — tap still opens /talk (P3 preparing).
   * `preparing` = job running; `soon` = not ready yet.
   */
  ready_chip?: TopicReadyChip;
};

export type ThemeWithTopics = {
  id: string;
  title_tl: string;
  title_ar: string;
  topics: TopicRow[];
};

export type TopicsListResult = {
  target_lang: string;
  themes: ThemeWithTopics[];
  /** First unlocked needs_review topic, for the home suggestion card. */
  suggestion: TopicRow | null;
};
