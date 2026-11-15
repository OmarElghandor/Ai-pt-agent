/** Role-play v1 content + session types. */

export type RoleplayTier = 1 | 2 | 3;

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
  min_tier: RoleplayTier;
  if_slot?: Record<string, string>;
  says: RoleplayLine | null;
  says_alt?: RoleplayLine[];
  speaker?: string;
  coach_eg?: string;
  expects: RoleplayExpects;
  help: RoleplayHelp;
  reply?: RoleplayLine;
};

export type RoleplaySituation = {
  id: string;
  target_lang: string;
  level: number;
  order: number;
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

export type RoleplayIndexScenario = {
  id: string;
  level: number;
  order: number;
  recommended_day: number;
  emoji: string;
  title_tl: string;
  title_ar: string;
  steps: number;
  steps_by_tier: [number, number, number];
};

export type RoleplayIndexLevel = {
  level: number;
  name_eg: string;
  name_en: string;
  scenarios: RoleplayIndexScenario[];
};

export type RoleplayIndexTier = {
  tier: RoleplayTier;
  name_eg: string;
  desc_eg: string;
};

export type RoleplayIndex = {
  target_lang: string;
  tiers: RoleplayIndexTier[];
  levels: RoleplayIndexLevel[];
};

export type RoleplayValidationIssue = {
  situation_id: string;
  path: string;
  message: string;
};
