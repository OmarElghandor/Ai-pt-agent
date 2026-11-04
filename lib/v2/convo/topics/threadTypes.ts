/** Authored free-chat thread files (Batch 9). */

export type ThreadLineKind = 'open' | 'either_or' | 'yes_no';

export type ThreadFrame = {
  tl: string;
  eg: string;
  chips: string[];
};

export type ThreadShare = {
  tl: string;
  ar: string;
};

export type ThreadAsk = {
  tl: string;
  ar: string;
  kind: ThreadLineKind;
  frame: ThreadFrame;
};

export type ThreadFollowUp = ThreadAsk & {
  skip_if_negative?: boolean;
};

export type Thread = {
  id: string;
  share: ThreadShare;
  ask: ThreadAsk;
  follow_ups: ThreadFollowUp[];
};

export type ThreadTopicMeta = {
  id: string;
  title_tl: string;
  title_in_sentence_tl: string;
  title_ar: string;
  character_id: string;
  related: string[];
  intro_eg: string;
  opening_tl: string;
  opening_ar: string;
};

export type ThreadTopicFile = {
  target_lang: string;
  version: number;
  topic: ThreadTopicMeta;
  threads: Thread[];
};

export type ThreadCheckIssue = {
  path: string;
  rule:
    | 'shape'
    | 'question_mark'
    | 'ar'
    | 'chips'
    | 'brazilian'
    | 'english'
    | 'formal'
    | 'tu'
    | 'id';
  message: string;
};

export type ValidateThreadsResult = {
  ok: boolean;
  issues: ThreadCheckIssue[];
  doc: ThreadTopicFile | null;
};

/** Catalogue row derived from a thread file (API + off-topic). */
export type FreeTopic = {
  id: string;
  title_tl: string;
  title_ar: string;
  title_in_sentence_tl: string;
  character_id: string;
  intro_eg: string;
  opening_tl: string;
  opening_ar: string;
  related_topic_ids: string[];
  /** Content words for off-topic (derived from thread lines + chips). */
  word_set: string[];
};

export type FreeTopicsFile = {
  target_lang: string;
  topics: FreeTopic[];
};
