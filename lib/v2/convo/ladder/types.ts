import type { GradeConvoAnswerResult } from '@/lib/v2/convo/grade';
import type {
  ConvoPendingQuestion,
  ConvoPhase,
  ConvoSession,
} from '@/lib/v2/convo/session';

/** Coach-bank moment ids emitted by the ladder (09 §7). */
export type CoachMoment =
  | 'first_said'
  | 'success_after_struggle'
  | 'streak_3'
  | 'group_done'
  | 'conversation_finished'
  | 'miss_1'
  | 'miss_2'
  | 'miss_3'
  | 'miss_4'
  | 'unclear'
  | 'near_miss_repeat';

export type ConvoEventFacts = {
  verdict: GradeConvoAnswerResult['verdict'];
  item_id: string;
  question_id: string;
  question_kind: NonNullable<ConvoPendingQuestion>['kind'];
  /** Help-ladder step after this apply (wrong) or before clear (correct). */
  help_step?: number;
  attempts?: number;
  /** Correct open answer with no prior help on this question. */
  first_without_help?: boolean;
  /** Misses before this correct answer. */
  after_misses?: number;
  mistake_id?: string;
  consequence_tl?: string;
  near_miss?: boolean;
  phase?: ConvoPhase;
};

export type ConvoGroupAdvance = {
  /** 1-based group index that just became active. */
  group: number;
  card_ids: string[];
  coach_intros: Array<{ item_id: string; coach_intro_eg: string }>;
};

export type ApplyConvoGradeResult = {
  session: ConvoSession;
  moments: CoachMoment[];
  event: ConvoEventFacts;
  group_advance: ConvoGroupAdvance | null;
};
