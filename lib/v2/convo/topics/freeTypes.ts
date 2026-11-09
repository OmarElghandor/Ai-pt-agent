/**
 * Free-chat types. Catalogue + threads live in threadTypes;
 * angle types remain for the T7.1 generation job until C10 retargets it.
 */

export type {
  FreeTopic,
  FreeTopicsFile,
  ThreadTopicFile,
  Thread,
  ThreadAsk,
  ThreadFollowUp,
  ThreadFrame,
  ThreadCheckIssue,
  ValidateThreadsResult,
} from './threadTypes';

/** @deprecated Batch 9 — angle banks removed; kept for topic_angles job until C10. */
export type TopicAngle = {
  id: string;
  tl: string;
  item_hints: string[];
};

/** @deprecated Batch 9 — kept for topic_angles job until C10. */
export type TopicAnglesDoc = {
  target_lang: string;
  topic_id: string;
  angles: TopicAngle[];
  version?: number;
};

/** @deprecated Batch 9 — kept for topic_angles job until C10. */
export type AngleCheckIssue = {
  path: string;
  rule: 'count' | 'brazilian' | 'english' | 'length' | 'shape' | 'id';
  message: string;
};

/** @deprecated Batch 9 — kept for topic_angles job until C10. */
export type ValidateAnglesResult = {
  ok: boolean;
  issues: AngleCheckIssue[];
  doc: TopicAnglesDoc | null;
};
