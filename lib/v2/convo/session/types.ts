/** Item ladder rungs (09 §3). */
export type ConvoRung =
  | 'taught'
  | 'heard'
  | 'understood'
  | 'said'
  | 'assisted';

export type ConvoModule = 'lesson' | 'free';

export type ConvoSessionStatus = 'open' | 'done';

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

export type StartConvoResult = {
  session: ConvoSession;
  opening: ConvoOpeningBubbles;
  /** True when an existing open session was reused. */
  resumed: boolean;
};
