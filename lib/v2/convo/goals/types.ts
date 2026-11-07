/** Conversations v3 free-talk goal (batch-v3-two-modes). */

export type ConvoGoalHelp = {
  frame_tl: string;
  eg: string;
  chips: string[];
};

export type ConvoGoal = {
  id: string;
  /** What the learner should express, one Egyptian line. */
  intent_eg: string;
  /** 2–4 accepted ways to say it. */
  examples_tl: string[];
  /** Content-word lemmas for plausibility checks. */
  keywords: string[];
  /** Character can share this to open the goal. */
  seed_tl?: string;
  seed_ar?: string;
  help: ConvoGoalHelp;
};

export type ConvoGoalStatus = 'open' | 'done' | 'assisted';

export type ConvoGoalState = {
  id: string;
  status: ConvoGoalStatus;
};

export type ConvoSceneTimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export type ConvoScene = {
  place?: string;
  character_id: string;
  time_of_day: ConvoSceneTimeOfDay;
};

export type ConvoGoalBank = {
  source: 'thread' | 'lesson' | 'generated';
  topic_id?: string;
  day?: number;
  goals: ConvoGoal[];
  /** Words (not goals) for the session chip strip. */
  suggested_words: string[];
  scene?: ConvoScene;
};

export type ConvoGoalIssue = {
  path: string;
  rule: 'shape' | 'examples' | 'keywords' | 'help' | 'intent';
  message: string;
};
