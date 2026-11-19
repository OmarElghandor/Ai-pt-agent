/** Conversations v3/v4 free-talk goal (batch-v3 + batch-v4). */

export type ConvoGoalHelp = {
  frame_tl: string;
  eg: string;
  chips: string[];
  /** Female learner chip variants (scenes / role-play). */
  chips_f?: string[];
};

export type ConvoSceneTimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export type ConvoSceneAddress = 'formal' | 'tu';

export type ConvoGoalTier = 'core' | 'extended';

/** Authored teaching beat (v4): character line → coach meaning → ask_tl. */
export type ConvoGoalTeach = {
  tl: string;
  ar: string;
  meaning_eg: string;
  /** Female learner variants (optional). */
  tl_f?: string;
  ar_f?: string;
};

export type ConvoGoal = {
  id: string;
  /** What the learner should express, one Egyptian line. */
  intent_eg: string;
  /** Short English steer line for the CURRENT GOAL prompt part. */
  intent_en?: string;
  /** 2–4 accepted ways to say it. */
  examples_tl: string[];
  /** Content-word lemmas for plausibility checks. */
  keywords: string[];
  /** Character can share this to open the goal. */
  seed_tl?: string;
  seed_ar?: string;
  /**
   * Character line that opens this goal (authored / generated lesson banks).
   * Never the learner's expected line.
   */
  ask_tl?: string;
  ask_ar?: string;
  ask_tl_f?: string;
  ask_ar_f?: string;
  /** When this goal becomes current, scene time moves to it. */
  time_of_day?: ConvoSceneTimeOfDay;
  /** v4: core (required) vs extended (optional). */
  tier?: ConvoGoalTier;
  /** Curriculum item ids this goal practices. */
  item_ids?: string[];
  /** v4 teaching beat — model never invents this. */
  teach?: ConvoGoalTeach;
  /**
   * Scene banks: facts the character must use and must not invent
   * (prices, times, places, what's included).
   */
  facts_tl?: string[];
  /** Scene banks: one short Egyptian cue under the character bubble. */
  cue_eg?: string;
  /** Scene banks: 2–4 Egyptian words for the mission checklist. */
  label_eg?: string;
  /** Scene banks: last goal — the goodbye. */
  farewell?: boolean;
  help: ConvoGoalHelp;
  /** Format 3: character ask variants. */
  ask?: SceneLine[];
  /** Format 3: matchable options with authored reacts. */
  options?: SceneOption[];
  /** Format 3: unclear turn variants. */
  unclear?: SceneLine[];
  /** Format 3: suggestion chips. */
  suggest?: string[];
  suggest_f?: string[];
  /**
   * Format 3: Egyptian hint (legacy). Prefer `hints`.
   * Kept for soft-compat when loading older banks.
   */
  hint_eg?: string;
  /** Format 3: progressive hint ladder (what → words → frame). */
  hints?: SceneHints;
};

/** Format 3 progressive hints (batch-rp-3 Change 2026-11-19). */
export type SceneHints = {
  what_eg: string;
  words_eg: string;
  frame_tl: string;
};

/** One authored PT+AR line (format 3 scenes). */
export type SceneLine = {
  tl: string;
  ar: string;
  /** Female learner variants (optional). */
  tl_f?: string;
  ar_f?: string;
};

/** One matchable option on a format-3 scene goal. */
export type SceneOption = {
  value: string;
  keywords: string[];
  examples: string[];
  react: SceneLine[];
};

export type SceneGlobalBlock = {
  greeting: { keywords: string[]; react: SceneLine[] };
  thanks: { keywords: string[]; react: SceneLine[] };
  side_unknown: { react: SceneLine[] };
};

export type ConvoGoalStatus = 'open' | 'done' | 'assisted' | 'skipped';

export type ConvoGoalState = {
  id: string;
  status: ConvoGoalStatus;
};

export type ConvoScene = {
  place?: string;
  character_id: string;
  time_of_day: ConvoSceneTimeOfDay;
  /** formal → o senhor / a senhora; tu → informal. */
  address?: ConvoSceneAddress;
};

export type ConvoBankOpening = {
  tl: string;
  ar: string;
  tl_f?: string;
  ar_f?: string;
};

export type ConvoBankClosing = {
  tl: string;
  ar: string;
  tl_f?: string;
  ar_f?: string;
};

export type ConvoGoalBank = {
  source: 'thread' | 'lesson' | 'generated' | 'topic';
  /**
   * Role-play scene bank (batch-rp-2). Loaded from content/v2/convo/scenes/,
   * never from the free-talk topic catalog.
   */
  kind?: 'scene';
  /** Scene bank schema version. Format 3 = authored bubbles + Qwen JSON only. */
  format?: 2 | 3;
  topic_id?: string;
  day?: number;
  goals: ConvoGoal[];
  /** Words (not goals) for the session chip strip. */
  suggested_words: string[];
  scene?: ConvoScene;
  /** Authored / generated lesson-day framing (fix-1). */
  authored?: boolean;
  title_tl?: string;
  title_ar?: string;
  intro_eg?: string;
  /** Egyptian scene for the topic (v4). */
  scene_eg?: string;
  opening?: ConvoBankOpening;
  closing?: ConvoBankClosing;
  /** Format 3: opening / closing variant arrays. */
  opening_lines?: SceneLine[];
  closing_lines?: SceneLine[];
  /** Format 3: greeting / thanks / side_unknown. */
  global?: SceneGlobalBlock;
  /** Scene entry card emoji. */
  emoji?: string;
  /** Scene path metadata: suggested curriculum day. */
  recommended_day?: number;
  /**
   * Core curriculum items the topic needs (v4). Computed once and stored.
   * A topic is allowed at level N when every id is introduced by day ≤ N.
   */
  required_items?: string[];
  /** Surface forms outside the curriculum (teaching mode). */
  new_items_tl?: string[];
  /** @deprecated Prefer new_items_tl — accepted when loading topic banks. */
  new_tl?: string[];
};

export type ConvoGoalIssue = {
  path: string;
  rule:
    | 'shape'
    | 'examples'
    | 'keywords'
    | 'help'
    | 'intent'
    | 'ask'
    | 'opening'
    | 'closing'
    | 'farewell'
    | 'kind';
  message: string;
};
