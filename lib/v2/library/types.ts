export const LIBRARY_LANG = 'pt-PT';

export const LIBRARY_TYPES = ['story', 'podcast'] as const;
export type LibraryType = (typeof LIBRARY_TYPES)[number];

/** Fixed stage order (14d §1). */
export const LIBRARY_STAGES = [
  'brief',
  'script',
  'tokens',
  'review',
  'voices',
  'audio',
  'images',
  'publish',
] as const;
export type LibraryStage = (typeof LIBRARY_STAGES)[number];

export const STAGE_STATUSES = {
  brief: ['draft', 'approved'],
  script: ['none', 'generating', 'ready', 'failed'],
  tokens: ['none', 'generating', 'ready', 'failed'],
  review: ['open', 'approved'],
  voices: ['missing', 'ok'],
  audio: ['none', 'estimated', 'building', 'ready', 'partial', 'failed'],
  images: ['none', 'queued', 'partial', 'ready'],
  publish: ['draft', 'published', 'hidden'],
} as const satisfies Record<LibraryStage, readonly string[]>;

export type StageStatus<S extends LibraryStage = LibraryStage> =
  (typeof STAGE_STATUSES)[S][number];

export type StageState<S extends LibraryStage = LibraryStage> = {
  status: StageStatus<S>;
  /** Matches v2 library episode stage subdoc (`Date` in Mongo). */
  updated_at?: Date | null;
  stale: boolean;
  stale_reason?: string | null;
};

export type EpisodeStages = { [S in LibraryStage]: StageState<S> };

/** Admin list filter buckets (14d §2.1). */
export const STAGE_BUCKETS = [
  'needs_review',
  'needs_audio',
  'ready_to_publish',
  'published',
] as const;
export type StageBucket = (typeof STAGE_BUCKETS)[number];

export type VoiceKind = 'cast' | 'pool' | 'narrator' | 'learner_f';

export type BriefCastRow = {
  voice_key: string;
  role_eg: string;
  learner: boolean;
};

export type BriefMoment = {
  id: string;
  eg: string;
  direction: string;
  must_say: string;
  bank_id: string | null;
};

/** Shape of one file in content/v2/library/briefs. */
export type BriefSeed = {
  target_lang: string;
  number: number;
  slug: string;
  type: LibraryType;
  target_level: number;
  intro_eg: string;
  cast: BriefCastRow[];
  places: string[];
  beats: string[];
  must_have_phrases: string[];
  moments: BriefMoment[];
  linked_episode: string | null;
  notes_admin?: string;
  sort_order: number;
};

export type VoiceSeed = {
  key: string;
  who?: string;
  gender?: 'm' | 'f';
  age_feel?: string;
  kind: VoiceKind;
  elevenlabs_voice_id?: string;
  stability?: unknown;
  similarity?: unknown;
  style?: unknown;
  approved: boolean;
};

export type MomentSeed = {
  id: string;
  place: string;
  eg: string;
  must_say: string;
  archived: boolean;
};

export type SettingsSeed = {
  target_lang: string;
  model?: unknown;
  output_format?: unknown;
  monthly_char_limit?: unknown;
  speed_by_level: Record<string, unknown>;
  check_script_text: string;
};

export type LibrarySeed = {
  target_lang: string;
  briefs: BriefSeed[];
  voices: VoiceSeed[];
  moments: MomentSeed[];
  settings: SettingsSeed;
};
