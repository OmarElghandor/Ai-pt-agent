import type { FreeThreadStep } from '@/lib/v2/convo/free/nextLine';
import type {
  ConvoGoalState,
  ConvoScene,
} from '@/lib/v2/convo/goals';

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

/** Last answer frame shown (open + thread). Side channel / help / resume read this. */
export type ConvoPendingFrame = {
  tl: string;
  eg: string;
  chips: string[];
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
  /** Index into the topic's thread list (Batch 9, legacy). */
  thread_index: number;
  /** Cursor within the current thread (or bridge) — legacy. */
  free_step: FreeThreadStep;
  /** Thread ids already closed this session — legacy. */
  threads_done: string[];
  /** Last authored line id shown (ask / follow-up / bridge) — legacy. */
  last_line_id: string | null;
  /** v3 free-talk goals (status only; definitions reloaded from bank). */
  goals: ConvoGoalState[];
  /** Id of the goal the character is steering toward. */
  current_goal: string | null;
  /** Learner PT turns since current_goal was set / last completed. */
  turns_on_goal: number;
  /** Scene fixed in code (time_of_day must not contradict the character). */
  scene: ConvoScene | null;
  /** When free talk was started from a lesson day (`?day=`). */
  lesson_day: number | null;
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
  /** Last FRAME/HINT/CHIPS (or authored thread frame) for help + side channel. */
  pending_frame: ConvoPendingFrame;
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
  /** Learner Portuguese lines this session (Batch 10 خلاص, max 8). */
  learner_lines: string[];
  /** Recast / free-text correction pairs (Batch 10 + K5). */
  recasts: Array<{ original: string; corrected: string; ar?: string }>;
  /** Language-Q group key being counted toward a Learn suggestion (D8). */
  learn_suggest_group: string | null;
  /** Hits on learn_suggest_group this session. */
  learn_suggest_count: number;
  /** True after one Learn suggestion (or dismiss) — no more this session. */
  learn_suggest_done: boolean;
  /**
   * Soft Learn CTA waiting for the learner's next message only (G4).
   * Cleared on yes/no/any other message or dismiss_cta.
   */
  pending_cta: { href: string; pack_id: string } | null;
  /**
   * PT phrase from the free Arabic coach for the learner to practise (G6).
   * Expires after 2 learner PT turns without a match.
   */
  coach_phrase: { phrase: string; turns_left: number } | null;
  /** Open-mode turns this session (E7 fallback rate). */
  open_turns: number;
  /** Open-mode turns that used the fallback bank. */
  open_fallbacks: number;
  /** Last pack correct-reaction tl (rotate; avoid back-to-back). */
  last_pack_reaction_tl?: string | null;
  created_at: string;
  updated_at: string;
};

export type ConvoOpeningBubbles = {
  /** Character opening line (free: opening + share + ask in one bubble). */
  character: { tl: string; ar?: string; say?: string };
  /** One Egyptian line that introduces the whole group (Learn). */
  intro_eg?: string;
  /** Group-1 coach intros / free intro_eg (behind «إزاي أفتكرها؟» on mini cards). */
  coach_intros: Array<{ item_id: string; coach_intro_eg: string }>;
  /** Group-1 card item ids. */
  card_ids: string[];
};

/** Payload when reopening mid-conversation (T4.1 / M7). */
export type ConvoReopeningPayload = {
  character_tl: string;
  character_ar?: string;
  pending_question: ConvoPendingQuestion;
  pending_tl: string | null;
  pending_audio_key: string | null;
  /** Restore map pulse to the pending question's node. */
  map_node?: string;
  /** @deprecated M7: no returned_after_break coach. */
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
