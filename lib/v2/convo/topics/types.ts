export type TopicStatus = 'solid' | 'needs_review' | 'not_tried';

export type TopicsFileTopic = {
  id: string;
  title_tl: string;
  title_ar: string;
  day: number;
  pack_id: string;
  item_ids: string[];
  character_id?: string;
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

export type TopicRow = TopicsFileTopic & {
  unlocked: boolean;
  pack_available: boolean;
  status: TopicStatus;
  /** Display glyph matching 09 §8. */
  status_glyph: '🟢' | '🟡' | '⚪';
  /** Display name for home suggestion copy (from characters.json). */
  character_name?: string;
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
