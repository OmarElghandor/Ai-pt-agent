/** Lesson / deck / activity progress types (doc 11). */

export const DEFAULT_LEARNER_TIMEZONE = 'Europe/Lisbon';

export type LessonProgressStatus =
  | 'locked'
  | 'scheduled'
  | 'available'
  | 'in_progress'
  | 'completed';

export type StepStatus = 'not_started' | 'done' | 'skipped';

export type LessonStepProgress = {
  id: string;
  status: StepStatus;
  done_at: string | null;
};

export type LessonResume = {
  step_id: string;
  page_index?: number;
  item_index?: number;
};

export type LessonPracticeFields = {
  times: number;
  last_at: string | null;
  said: number;
  understood: number;
  best_said: number;
};

export type LessonDayQuestionsProgress = {
  total: number;
  answered: number;
  first_try_correct: number;
  per_skill: Record<string, number>;
};

export type LessonProgress = {
  user_id: string;
  target_lang: string;
  day: number;
  status: LessonProgressStatus;
  opens_on: string | null;
  lesson_version: number | null;
  steps: LessonStepProgress[];
  resume: LessonResume | null;
  story_test: { first_try_correct: number; total: number } | null;
  day_questions: LessonDayQuestionsProgress;
  practice: LessonPracticeFields;
  started_at: string | null;
  completed_at: string | null;
  last_opened_at: string | null;
  times_completed: number;
  minutes: number;
};

export type WeakSpotStatus = 'open' | 'improving' | 'resolved';

export type WeakSpotEvidence = {
  error_ids: string[];
  correct_ids: string[];
};

export type WeakSpotExample = {
  wrong: string;
  right: string;
};

export type WeakSpot = {
  user_id: string;
  problem: string;
  status: WeakSpotStatus;
  evidence: WeakSpotEvidence;
  examples: WeakSpotExample[];
  items_seen: string[];
  opened_at: string | null;
  last_error_at: string | null;
  resolved_at: string | null;
};

export type CardDeckSlot = 'recent' | 'weak' | 'older';
export type CardDeckRating = 'again' | 'hard' | 'easy' | 'know';

export type CardDeckCard = {
  item_id: string;
  slot: CardDeckSlot;
  rating?: CardDeckRating;
  hint?: boolean;
  rated_at?: string;
};

export type CardDeck = {
  user_id: string;
  local_date: string;
  cards: CardDeckCard[];
  status: 'open' | 'done';
  built_at: string;
  done_at: string | null;
};

export type ActivityDay = {
  user_id: string;
  local_date: string;
  minutes: number;
  lesson_steps_done: number;
  cards_rated: number;
  conversation_turns: number;
  questions_answered: number;
  counts_for_streak: boolean;
};

export type UserStreak = {
  current: number;
  best: number;
  last_active_day: string | null;
  missed_days: string[];
};

export type ErrorProblemLabel = {
  id: string;
  by: 'code' | 'qwen';
  model?: string;
  confidence: 'low' | 'medium' | 'high';
  at: string;
  note_tl?: string;
};
