import type { ConvoTopicCatalogEntry } from '@/lib/v2/convo/topics/allowed';

export type RouterModelOutput = {
  /** Known catalog id, or "new" for a generated topic. */
  topic_id: string | 'new';
  new_topic_title?: string;
  confidence: number;
};

export type RouterClassifyInput = {
  message: string;
  level: number;
  catalog: Array<
    Pick<ConvoTopicCatalogEntry, 'id' | 'title_tl' | 'title_ar' | 'description'>
  >;
};

export type RouterClassifier = (
  input: RouterClassifyInput,
) => Promise<RouterModelOutput>;

export type RouterDecision =
  | {
      kind: 'greeting';
      /** Short character reply then re-ask topic — no lock. */
      reask: true;
    }
  | {
      kind: 'chips';
      reason: 'low_confidence' | 'unclear';
      confidence: number;
    }
  | {
      kind: 'lock';
      topic_id: string;
      teaching_mode: boolean;
      confidence: number;
      /** For generated / new topics. */
      new_topic_title?: string;
      is_new?: boolean;
    };

export const ROUTER_CONFIDENCE_FLOOR = 0.6;
