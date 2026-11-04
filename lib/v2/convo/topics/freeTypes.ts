/** Free-chat catalogue topic (09 §9 / T7.1). */
export type FreeTopic = {
  id: string;
  title_tl: string;
  title_ar: string;
  character_id: string;
  /** Content words used for off-topic detection (T7.3). */
  word_set: string[];
  /** Nearby catalogue topics for bridge / switch. */
  related_topic_ids: string[];
};

export type FreeTopicsFile = {
  target_lang: string;
  topics: FreeTopic[];
};

/** One angle in the free-topic bank (pt-PT question + item hints). */
export type TopicAngle = {
  id: string;
  tl: string;
  item_hints: string[];
};

export type TopicAnglesDoc = {
  target_lang: string;
  topic_id: string;
  angles: TopicAngle[];
  version?: number;
};

export type AngleCheckIssue = {
  path: string;
  rule: 'count' | 'brazilian' | 'english' | 'length' | 'shape' | 'id';
  message: string;
};

export type ValidateAnglesResult = {
  ok: boolean;
  issues: AngleCheckIssue[];
  doc: TopicAnglesDoc | null;
};
