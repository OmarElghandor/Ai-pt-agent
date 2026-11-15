import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/* Library (14 §3, 14d §3): briefs, episodes, jobs, voices, settings. */
/* Split from models.ts so Next/Turbopack loads a fresh module (HMR-safe). */

const V2_LIBRARY_TYPES = ['story', 'podcast'] as const;
const V2_LIBRARY_JOB_KINDS = [
  'library_script',
  'library_line_rewrite',
  'library_tokens',
  'library_audio_line',
  'library_stitch',
  'library_image',
  'library_voice_test',
] as const;

const v2LibraryBriefSchema = new Schema(
  {
    target_lang: { type: String, required: true },
    slug: { type: String, required: true },
    number: { type: Number, required: true },
    type: { type: String, required: true, enum: V2_LIBRARY_TYPES },
    target_level: { type: Number, required: true, min: 1, max: 5 },
    intro_eg: { type: String, required: true, default: '' },
    /** { voice_key, role_eg, learner } */
    cast: { type: [Schema.Types.Mixed], default: [] },
    places: { type: [String], default: [] },
    beats: { type: [String], default: [] },
    must_have_phrases: { type: [String], default: [] },
    /** { id, eg, direction, must_say, bank_id } */
    moments: { type: [Schema.Types.Mixed], default: [] },
    linked_episode: { type: String, required: false, default: null },
    status: {
      type: String,
      required: true,
      enum: ['draft', 'approved'],
      default: 'draft',
    },
    sort_order: { type: Number, required: true, default: 0 },
    /** True once an admin saved the brief; import never overwrites it. */
    admin_edited: { type: Boolean, required: true, default: false },
    notes_admin: { type: String, required: false },
    /** Hash of the seed file this brief was last imported from. */
    source_hash: { type: String, required: false },
    approved_by: { type: String, required: false },
    approved_at: { type: Date, required: false },
  },
  { timestamps: true, collection: 'v2_library_briefs' },
);

v2LibraryBriefSchema.index({ target_lang: 1, slug: 1 }, { unique: true });
v2LibraryBriefSchema.index({ target_lang: 1, target_level: 1, sort_order: 1 });

export type V2LibraryBriefDoc = InferSchemaType<typeof v2LibraryBriefSchema> & {
  _id: mongoose.Types.ObjectId;
};

export function V2LibraryBriefModel(): Model<V2LibraryBriefDoc> {
  return (
    (mongoose.models.V2LibraryBrief as Model<V2LibraryBriefDoc>) ||
    mongoose.model<V2LibraryBriefDoc>('V2LibraryBrief', v2LibraryBriefSchema)
  );
}

/** One stage entry on an episode (14d §1). */
const v2LibraryStageSchema = new Schema(
  {
    status: { type: String, required: true },
    updated_at: { type: Date, required: false },
    stale: { type: Boolean, required: true, default: false },
    stale_reason: { type: String, required: false },
  },
  { _id: false },
);

const v2LibraryEpisodeSchema = new Schema(
  {
    target_lang: { type: String, required: true },
    slug: { type: String, required: true },
    version: { type: Number, required: true, min: 1, default: 1 },
    status: {
      type: String,
      required: true,
      enum: ['draft', 'published', 'hidden'],
      default: 'draft',
    },
    type: { type: String, required: true, enum: V2_LIBRARY_TYPES },
    target_level: { type: Number, required: true, min: 1, max: 5 },
    measured_level: { type: Number, required: false },
    measured_score: { type: Schema.Types.Mixed, required: false },
    title_tl: { type: String, required: false },
    title_ar: { type: String, required: false },
    intro_eg: { type: String, required: false },
    /** { role, voice_key, gender, learner } */
    cast: { type: [Schema.Types.Mixed], default: [] },
    stages: {
      brief: { type: v2LibraryStageSchema, required: true },
      script: { type: v2LibraryStageSchema, required: true },
      tokens: { type: v2LibraryStageSchema, required: true },
      review: { type: v2LibraryStageSchema, required: true },
      voices: { type: v2LibraryStageSchema, required: true },
      audio: { type: v2LibraryStageSchema, required: true },
      images: { type: v2LibraryStageSchema, required: true },
      publish: { type: v2LibraryStageSchema, required: true },
    },
    /** Flexible: tl, tl_f, ar, speaker, scene, moment, tokens, audio, hand_edited, audio_stale. */
    lines: { type: [Schema.Types.Mixed], default: [] },
    notes: { type: [Schema.Types.Mixed], default: [] },
    images: { type: Schema.Types.Mixed, required: false },
    costs: { type: Schema.Types.Mixed, default: {} },
    warnings: { type: [Schema.Types.Mixed], default: [] },
    prompt_versions: { type: Schema.Types.Mixed, required: false },
    duration_sec: { type: Number, required: false },
    published_version: { type: Number, required: false, default: null },
    draft_version: { type: Number, required: false, default: null },
    sort_order: { type: Number, required: true, default: 0 },
    /** { action, by, at } for approve, publish, hide, hand edit. */
    audit: { type: [Schema.Types.Mixed], default: [] },
    /** Last failed script run: { raw_failed: [{attempt, raw, errors}], at }. Cleared on success. */
    script_failure: { type: Schema.Types.Mixed, required: false, default: null },
  },
  { timestamps: true, collection: 'v2_library_episodes' },
);

v2LibraryEpisodeSchema.index(
  { target_lang: 1, slug: 1, version: 1 },
  { unique: true },
);
v2LibraryEpisodeSchema.index(
  { target_lang: 1, sort_order: 1 },
  { partialFilterExpression: { status: 'published' } },
);
v2LibraryEpisodeSchema.index({ target_lang: 1, target_level: 1, sort_order: 1 });

export type V2LibraryEpisodeDoc = InferSchemaType<
  typeof v2LibraryEpisodeSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export function V2LibraryEpisodeModel(): Model<V2LibraryEpisodeDoc> {
  return (
    (mongoose.models.V2LibraryEpisode as Model<V2LibraryEpisodeDoc>) ||
    mongoose.model<V2LibraryEpisodeDoc>(
      'V2LibraryEpisode',
      v2LibraryEpisodeSchema,
    )
  );
}

const v2LibraryJobSchema = new Schema(
  {
    kind: { type: String, required: true, enum: V2_LIBRARY_JOB_KINDS },
    target_lang: { type: String, required: true, default: 'pt-PT' },
    episode_slug: { type: String, required: true },
    line_index: { type: Number, required: false },
    /** Stage family (script, tokens, audio, images, voices): one active job per episode + family. */
    family: { type: String, required: false },
    /** Kind-specific input (mode, moment_id, instruction, force, by). */
    params: { type: Schema.Types.Mixed, required: false },
    /** Kind-specific output (raw_failed, replaced indices). */
    result: { type: Schema.Types.Mixed, required: false },
    /** True while queued or running; backs the unique partial index below. */
    active: { type: Boolean, required: false },
    status: {
      type: String,
      required: true,
      enum: ['queued', 'running', 'done', 'failed'],
      default: 'queued',
    },
    attempts: { type: Number, required: true, default: 0 },
    cost: { type: Schema.Types.Mixed, required: false },
    error: { type: String, required: false },
    started_at: { type: Date, required: false },
    finished_at: { type: Date, required: false },
  },
  { timestamps: true, collection: 'v2_library_jobs' },
);

v2LibraryJobSchema.index({ episode_slug: 1, kind: 1, status: 1 });
v2LibraryJobSchema.index({ status: 1, createdAt: 1 });
// One running/queued job per episode per stage family (14d §2.6).
v2LibraryJobSchema.index(
  { target_lang: 1, episode_slug: 1, family: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);

export type V2LibraryJobDoc = InferSchemaType<typeof v2LibraryJobSchema> & {
  _id: mongoose.Types.ObjectId;
};

export function V2LibraryJobModel(): Model<V2LibraryJobDoc> {
  return (
    (mongoose.models.V2LibraryJob as Model<V2LibraryJobDoc>) ||
    mongoose.model<V2LibraryJobDoc>('V2LibraryJob', v2LibraryJobSchema)
  );
}

const v2LibraryVoiceSchema = new Schema(
  {
    target_lang: { type: String, required: true, default: 'pt-PT' },
    key: { type: String, required: true },
    who: { type: String, required: false },
    gender: { type: String, required: false, enum: ['m', 'f'] },
    age_feel: { type: String, required: false },
    kind: {
      type: String,
      required: true,
      enum: ['cast', 'pool', 'narrator', 'learner_f'],
    },
    /** May hold a `<<PLACEHOLDER>>` string until Omar fills it. */
    elevenlabs_voice_id: { type: String, required: false },
    /** Numbers once set; seed carries `<<S>>` style placeholders. */
    stability: { type: Schema.Types.Mixed, required: false },
    similarity: { type: Schema.Types.Mixed, required: false },
    style: { type: Schema.Types.Mixed, required: false },
    approved: { type: Boolean, required: true, default: false },
    approved_at: { type: Date, required: false },
    admin_edited: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: 'v2_library_voices' },
);

v2LibraryVoiceSchema.index({ target_lang: 1, key: 1 }, { unique: true });

export type V2LibraryVoiceDoc = InferSchemaType<typeof v2LibraryVoiceSchema> & {
  _id: mongoose.Types.ObjectId;
};

export function V2LibraryVoiceModel(): Model<V2LibraryVoiceDoc> {
  return (
    (mongoose.models.V2LibraryVoice as Model<V2LibraryVoiceDoc>) ||
    mongoose.model<V2LibraryVoiceDoc>('V2LibraryVoice', v2LibraryVoiceSchema)
  );
}

/** One document per target language. */
const v2LibrarySettingsSchema = new Schema(
  {
    target_lang: { type: String, required: true },
    model: { type: Schema.Types.Mixed, required: false },
    output_format: { type: Schema.Types.Mixed, required: false },
    monthly_char_limit: { type: Schema.Types.Mixed, required: false },
    /** { "1": speed, ... "5": speed } */
    speed_by_level: { type: Schema.Types.Mixed, default: {} },
    /** pt-PT voice check script; entered by Omar only. */
    check_script_text: { type: String, required: false, default: '' },
  },
  { timestamps: true, collection: 'v2_library_settings' },
);

v2LibrarySettingsSchema.index({ target_lang: 1 }, { unique: true });

export type V2LibrarySettingsDoc = InferSchemaType<
  typeof v2LibrarySettingsSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export function V2LibrarySettingsModel(): Model<V2LibrarySettingsDoc> {
  return (
    (mongoose.models.V2LibrarySettings as Model<V2LibrarySettingsDoc>) ||
    mongoose.model<V2LibrarySettingsDoc>(
      'V2LibrarySettings',
      v2LibrarySettingsSchema,
    )
  );
}

const v2LibraryVoiceTestSchema = new Schema(
  {
    target_lang: { type: String, required: true, default: 'pt-PT' },
    voice_key: { type: String, required: true },
    model: { type: String, required: true },
    /** Hash of voice id + model + settings + check script. */
    settings_hash: { type: String, required: true },
    audio_url: { type: String, required: false },
    chars: { type: Number, required: false },
    cost: { type: Schema.Types.Mixed, required: false },
  },
  { timestamps: true, collection: 'v2_library_voice_tests' },
);

v2LibraryVoiceTestSchema.index(
  { target_lang: 1, voice_key: 1, model: 1, settings_hash: 1 },
  { unique: true },
);

export type V2LibraryVoiceTestDoc = InferSchemaType<
  typeof v2LibraryVoiceTestSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export function V2LibraryVoiceTestModel(): Model<V2LibraryVoiceTestDoc> {
  return (
    (mongoose.models.V2LibraryVoiceTest as Model<V2LibraryVoiceTestDoc>) ||
    mongoose.model<V2LibraryVoiceTestDoc>(
      'V2LibraryVoiceTest',
      v2LibraryVoiceTestSchema,
    )
  );
}

const v2LibraryMomentSchema = new Schema(
  {
    target_lang: { type: String, required: true, default: 'pt-PT' },
    id: { type: String, required: true },
    place: { type: String, required: true, index: true },
    eg: { type: String, required: true },
    must_say: { type: String, required: false, default: '' },
    archived: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: 'v2_library_moments' },
);

v2LibraryMomentSchema.index({ target_lang: 1, id: 1 }, { unique: true });

export type V2LibraryMomentDoc = InferSchemaType<
  typeof v2LibraryMomentSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export function V2LibraryMomentModel(): Model<V2LibraryMomentDoc> {
  return (
    (mongoose.models.V2LibraryMoment as Model<V2LibraryMomentDoc>) ||
    mongoose.model<V2LibraryMomentDoc>(
      'V2LibraryMoment',
      v2LibraryMomentSchema,
    )
  );
}

const v2LibraryTtsUsageSchema = new Schema(
  {
    target_lang: { type: String, required: true, default: 'pt-PT' },
    episode_slug: { type: String, required: true },
    line_index: { type: Number, required: false },
    voice_key: { type: String, required: false },
    model: { type: String, required: false },
    chars: { type: Number, required: true, default: 0 },
    cost_usd: { type: Number, required: false },
    /** YYYY-MM for the monthly cap. */
    month: { type: String, required: true, index: true },
    kind: { type: String, required: false },
  },
  { timestamps: true, collection: 'v2_library_tts_usage' },
);

v2LibraryTtsUsageSchema.index({ episode_slug: 1, createdAt: -1 });

export type V2LibraryTtsUsageDoc = InferSchemaType<
  typeof v2LibraryTtsUsageSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export function V2LibraryTtsUsageModel(): Model<V2LibraryTtsUsageDoc> {
  return (
    (mongoose.models.V2LibraryTtsUsage as Model<V2LibraryTtsUsageDoc>) ||
    mongoose.model<V2LibraryTtsUsageDoc>(
      'V2LibraryTtsUsage',
      v2LibraryTtsUsageSchema,
    )
  );
}

/** User-keyed (A5): deleted with the account. */
const v2LibraryProgressSchema = new Schema(
  {
    user_id: { type: String, required: true, index: true },
    episode_id: { type: String, required: true },
    target_lang: { type: String, required: false },
    last_line: { type: Number, required: true, default: 0 },
    finished_at: { type: Date, required: false },
    times_finished: { type: Number, required: true, default: 0 },
    saved_word_count: { type: Number, required: true, default: 0 },
  },
  { timestamps: true, collection: 'v2_library_progress' },
);

v2LibraryProgressSchema.index({ user_id: 1, episode_id: 1 }, { unique: true });

export type V2LibraryProgressDoc = InferSchemaType<
  typeof v2LibraryProgressSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export function V2LibraryProgressModel(): Model<V2LibraryProgressDoc> {
  return (
    (mongoose.models.V2LibraryProgress as Model<V2LibraryProgressDoc>) ||
    mongoose.model<V2LibraryProgressDoc>(
      'V2LibraryProgress',
      v2LibraryProgressSchema,
    )
  );
}
