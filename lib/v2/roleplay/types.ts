/** Role-play v1 content types (one-button path; no tiers). */

export type RoleplayLine = {
  tl: string;
  ar: string;
  tl_f?: string;
  ar_f?: string;
};

export type RoleplayKeyPhrase = {
  tl: string;
  ar: string;
  tl_f?: string;
};

export type RoleplayCharacterRef =
  | { id: string }
  | {
      id: null;
      name: string;
      gender: 'm' | 'f';
      role_eg: string;
    };

export type RoleplayCastMember = {
  id: string | null;
  name: string;
  gender: 'm' | 'f';
  role_eg?: string;
};

export type RoleplayOption = {
  value: string;
  keywords: string[];
  reply?: RoleplayLine;
  stay?: boolean;
};

export type RoleplayExpects = {
  intent_eg: string;
  examples_tl: string[];
  examples_tl_f?: string[];
  keywords: string[];
  free_answer?: boolean;
  slot?: string;
  options?: RoleplayOption[];
};

export type RoleplayHelp = {
  frame_tl: string;
  eg: string;
  chips: string[];
  chips_f?: string[];
};

export type RoleplayStep = {
  id: string;
  if_slot?: Record<string, string>;
  says: RoleplayLine | null;
  speaker?: string;
  /**
   * Learner must start this beat (ask the price, invite…). Show a one-line
   * 💡 cue (`do_eg`) under the character bubble automatically.
   */
  learner_leads?: boolean;
  /** What the learner must do now (EG); cue when learner_leads or stuck. */
  do_eg: string;
  /** Shown only when the learner is stuck (help). */
  hint_eg?: string;
  expects: RoleplayExpects;
  help: RoleplayHelp;
  reply?: RoleplayLine;
};

export type RoleplaySituation = {
  id: string;
  target_lang: string;
  round: number;
  recommended_day: number;
  emoji: string;
  title_tl: string;
  title_ar: string;
  place_eg: string;
  task_eg: string;
  learner_role_eg: string;
  character: RoleplayCharacterRef;
  cast?: RoleplayCastMember[];
  address: string;
  item_ids: string[];
  new_tl: string[];
  key_phrases: RoleplayKeyPhrase[];
  steps: RoleplayStep[];
  closing: RoleplayLine;
  summary_eg: string;
  authored?: boolean;
};

/** One entry in the authored path order. */
export type RoleplayPathEntry = {
  n: number;
  id: string;
  round: number;
  emoji: string;
  title_tl: string;
  title_ar: string;
  recommended_day: number;
  steps: number;
};

export type RoleplayIndex = {
  target_lang: string;
  path: RoleplayPathEntry[];
};

export type RoleplayValidationIssue = {
  situation_id: string;
  path: string;
  message: string;
};
