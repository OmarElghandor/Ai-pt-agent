import type { Skill } from '@/lib/v2/content/lesson';

export type FeedbackVerdict =
  | 'correct'
  | 'near_miss'
  | 'wrong'
  | 'unclear'
  | 'self_rated';

export type ReviewQuestion = Record<string, unknown> & {
  id?: string;
  type: string;
  skill?: Skill;
  prompt?: unknown;
  prompt_eg?: string;
  options?: unknown[];
  tiles?: string[];
  answer?: number | number[];
  accepted?: string[];
  tests?: string[];
  near_miss?: { tl: string; feedback_eg?: string }[];
  hint?: string;
  image_url?: string;
  image_refs?: string[];
  reading?: unknown;
  character?: { name?: string; tl?: string; avatar?: string };
  situation_eg?: string;
  rule_chip?: string;
  think_eg?: string;
  slot_labels?: string[];
  grammar_note?: { rule_eg: string; wrong_tl: string; right_tl: string };
  prompt_tl?: string;
  prompt_ar?: string;
  say?: string;
};

export type ReviewStepPair = {
  item_id: string;
  skill: string;
};

export type ReviewStepDisplay = {
  verdict: FeedbackVerdict;
  learner_text: string;
  correct_tl?: string;
  meaning_eg?: string;
  why_eg?: string;
  corrected_tl?: string;
  highlight_start?: number;
  highlight_end?: number;
  grammar_note?: { rule_eg: string; wrong_tl: string; right_tl: string };
  stage_labels?: string[];
  logged_weak?: boolean;
  self_rating?: 'said_correct' | 'near' | 'still';
  model_tl?: string;
};

export type ReviewStep = {
  kind?: string;
  lesson_day: number;
  pairs: ReviewStepPair[];
  slot_reason?: string;
  estimated_seconds?: number;
  round: number;
  question?: ReviewQuestion | null;
  result?: { correct?: boolean } | null;
  answer_id?: string;
  /** Fixture / frozen replay — rich feedback without re-grading. */
  display?: ReviewStepDisplay;
};

export type ReviewSession = {
  local_date: string;
  budget_minutes: number;
  window: Array<{ day: number; position: number }>;
  steps: ReviewStep[];
  rounds_total: number;
  rounds_done: number;
  status: 'open' | 'done';
  resume: { round: number; step: number };
  empty?: boolean;
  empty_reason?: import('@/lib/v2/practice/reviewEmpty').ReviewEmptyReason;
  completed_days?: number[];
  current_day?: number;
  learner_name?: string;
};

export type ThreadMessageKind =
  | 'opening'
  | 'round_divider'
  | 'round_collapsed'
  | 'character'
  | 'question'
  | 'learner'
  | 'feedback'
  | 'typing'
  | 'hint'
  | 'round_end'
  | 'session_end';

export type ThreadMessage = {
  id: string;
  kind: ThreadMessageKind;
  round?: number;
  stepIndex?: number;
  /** Collapsed round summary count. */
  answeredCount?: number;
  text?: string;
  question?: ReviewQuestion;
  lessonDay?: number;
  stepInRound?: number;
  stepsInRound?: number;
  display?: ReviewStepDisplay;
  characterName?: string;
  characterTl?: string;
  characterHidden?: boolean;
  audioText?: string;
  compact?: boolean;
};

export type ComposerKind =
  | 'none'
  | 'choice'
  | 'chips'
  | 'text'
  | 'tiles'
  | 'mic'
  | 'image_grid'
  | 'self_rate'
  | 'next'
  | 'round_end'
  | 'session_end';

export type LocalAnswerState = {
  stepIndex: number;
  learnerText: string;
  verdict?: FeedbackVerdict;
  feedback?: ReviewStepDisplay;
  pending?: boolean;
  firstTryPosted?: boolean;
  hintUsed?: boolean;
};