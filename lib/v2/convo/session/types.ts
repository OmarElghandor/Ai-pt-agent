import type { FreeThreadStep } from '@/lib/v2/convo/free/nextLine';

export type { FreeThreadStep };

/** Item ladder rungs (09 §3). */
export type ConvoRung =
  | 'taught'
  | 'heard'
  | 'understood'
  | 'said'
  | 'assisted';

export type ConvoModule = 'lesson' | 'free';

export type ConvoSessionStatus = 'open' | 'done';

/** Lesson-conversation phase (teaching → recap → closing). */
export type ConvoPhase = 'teaching' | 'recap' | 'closing';

export type ConvoExchange = {
  role: 'character' | 'learner';
  tl: string;
};

export type ConvoPendingQuestion = {
  id: string;
  kind: 'choice' | 'open' | 'recap' | 'help';
  item_id: string;
} | null;

export type ConvoHelpLadderState = {
  /** Question currently on the help ladder (empty when idle). */
  question_id: string | null;
  /** 0 = not on ladder; 1–4 = help steps. */
  step: 0 | 1 | 2 | 3 | 4;
  /** Attempts on the current question. */
  attempts: number;
};

export type ConvoSession = {
  id: string;
  user_id: string;
  module: ConvoModule;
  pack_id: string;
  /** Free-chat topic id when module === 'free'. */
  topic_id: string | null;
  /** Character for free chat (from free-topics file). */
  character_id: string | null;
  /** Index into the topic's thread list (Batch 9). */
  thread_index: number;
  /** Cursor within the current thread (or bridge). */
  free_step: FreeThreadStep;
  /** Thread ids already closed this session. */
  threads_done: string[];
  /** Last authored line id shown (ask / follow-up / bridge). */
  last_line_id: string | null;
  /** True when the learner used ساعدني أرد on the current question. */
  assisted: boolean;
  /** Consecutive off-topic learner turns (T7.3). */
  off_topic_streak: number;
  /** Lesson pack opened mid free-chat (T7.5); free stays open. */
  paused_for_pack_id: string | null;
  /** Rung per lesson item id. */
  rungs: Record<string, ConvoRung>;
  help_ladder: ConvoHelpLadderState;
  /** 1-based group index. */
  current_group: number;
  /** Recently asked question ids (newest last). */
  candidate_history: string[];
  /** Last ≤3 character/learner exchanges (pt-PT only). */
  last_exchanges: ConvoExchange[];
  pending_question: ConvoPendingQuestion;
  facts: string[];
  suggested_words: string[];
  status: ConvoSessionStatus;
  /** teaching → recap (all produced) → closing (recap done). */
  phase: ConvoPhase;
  /** Consecutive correct / near_miss answers. */
  correct_streak: number;
  /** Items that hit the help ladder at least once. */
  struggled: Record<string, boolean>;
  /** Items that reached 🗣 (said) at least once without help. */
  said_once: Record<string, boolean>;
  /** Last ≤3 coach-bank line ids (T1.7). */
  coach_recent_ids: string[];
  /** Recap question ids already answered correctly. */
  recap_done_ids: string[];
  /** Survival button uses this session (Pode repetir? / Mais devagar / Não percebi). */
  survival_used: number;
  created_at: string;
  updated_at: string;
};

export type ConvoOpeningBubbles = {
  /** Character opening line. */
  character: { tl: string; say?: string };
  /** Group-1 coach intros. */
  coach_intros: Array<{ item_id: string; coach_intro_eg: string }>;
  /** Group-1 card item ids. */
  card_ids: string[];
};

/** Payload when reopening mid-conversation (T4.1). */
export type ConvoReopeningPayload = {
  character_tl: string;
  pending_question: ConvoPendingQuestion;
  pending_tl: string | null;
  pending_audio_key: string | null;
  coach?: { id: string; eg: string };
};

export type StartConvoResult = {
  session: ConvoSession;
  opening: ConvoOpeningBubbles;
  /** True when an existing open session was reused. */
  resumed: boolean;
  /** Present when resumed with a pending question (template reopening, no model). */
  reopening?: ConvoReopeningPayload;
};
