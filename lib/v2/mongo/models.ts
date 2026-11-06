import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const V2_LESSON_STATUSES = ['draft', 'reviewed', 'published'] as const;

const v2LessonSchema = new Schema(
  {
    day: { type: Number, required: true, index: true },
    target_lang: { type: String, required: true, index: true },
    version: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      required: true,
      enum: V2_LESSON_STATUSES,
      index: true,
    },
    data: { type: Schema.Types.Mixed, required: true },
    meta: { type: Schema.Types.Mixed, required: false },
  },
  { timestamps: true, collection: 'v2_lessons' },
);

v2LessonSchema.index({ day: 1, target_lang: 1, version: 1 }, { unique: true });
v2LessonSchema.index({ day: 1, target_lang: 1, status: 1 });

const overrideFormSchema = new Schema(
  {
    tl: String,
    say: String,
    irregular: Boolean,
    stem: String,
    ending: String,
  },
  { _id: false },
);

const v2ConjugationSchema = new Schema(
  {
    lemma: { type: String, required: true, unique: true, index: true },
    target_lang: { type: String, required: true, default: 'pt-PT' },
    class: { type: String, required: true },
    meaning_ar: { type: String, required: true },
    verified: { type: Boolean, default: false },
    overrides: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'v2_conjugations' },
);

export type V2LessonDoc = InferSchemaType<typeof v2LessonSchema> & {
  _id: mongoose.Types.ObjectId;
};

export type V2ConjugationDoc = InferSchemaType<typeof v2ConjugationSchema> & {
  _id: mongoose.Types.ObjectId;
};

export function V2LessonModel(): Model<V2LessonDoc> {
  return (
    (mongoose.models.V2Lesson as Model<V2LessonDoc>) ||
    mongoose.model<V2LessonDoc>('V2Lesson', v2LessonSchema)
  );
}

export function V2ConjugationModel(): Model<V2ConjugationDoc> {
  return (
    (mongoose.models.V2Conjugation as Model<V2ConjugationDoc>) ||
    mongoose.model<V2ConjugationDoc>('V2Conjugation', v2ConjugationSchema)
  );
}

export const V2_JOB_KINDS = [
  'items',
  'story',
  'outline',
  'page',
  'critic',
  'questions',
  'micro',
  'daily_use',
  'real_world',
  'continuity',
  'assemble',
  'lang_check',
  'image_specs',
  'image',
  'pack_outline',
  'pack_beats',
  'pack_critic',
  'pack_lang_check',
  'pack_assemble',
  'convo_outline',
  'convo_items',
  'convo_critic',
  'convo_lang_check',
  'convo_assemble',
  'topic_angles',
] as const;

export type V2JobKind = (typeof V2_JOB_KINDS)[number];

const V2_JOB_STATUSES = [
  'queued',
  'running',
  'done',
  'failed',
  'stale',
  /** Soft job finished without a usable output; deps may still proceed. */
  'skipped',
] as const;

const v2JobAttemptSchema = new Schema(
  {
    attempt: { type: Number, required: true },
    started_at: { type: Date, required: false },
    finished_at: { type: Date, required: false },
    input: { type: Schema.Types.Mixed, required: false },
    output: { type: Schema.Types.Mixed, required: false },
    tokens: { type: Schema.Types.Mixed, required: false },
    over_budget: { type: Boolean, required: false },
    issues: { type: Schema.Types.Mixed, required: false },
    provider: { type: String, required: false },
    model: { type: String, required: false },
    usd_estimate: { type: Number, required: false },
  },
  { _id: false },
);

const v2JobSchema = new Schema(
  {
    /** Legacy field; new jobs use kind. Kept for old generate_lesson rows. */
    type: { type: String, required: false, index: true },
    kind: {
      type: String,
      required: true,
      enum: V2_JOB_KINDS,
      index: true,
    },
    lesson_id: { type: String, required: true, index: true },
    day: { type: Number, required: true, index: true },
    target_lang: { type: String, required: true, default: 'pt-PT' },
    version: { type: Number, required: true },
    page_index: { type: Number, required: false },
    page_id: { type: String, required: false },
    depends_on: { type: [{ type: Schema.Types.ObjectId, ref: 'V2Job' }], default: [] },
    input_hash: { type: String, required: false },
    status: {
      type: String,
      required: true,
      enum: V2_JOB_STATUSES,
      index: true,
    },
    /** Legacy bag; prefer first-class fields below. */
    progress: { type: Schema.Types.Mixed, required: false },
    provider: { type: String, required: false },
    model: { type: String, required: false },
    started_at: { type: Date, required: false },
    finished_at: { type: Date, required: false },
    input: { type: Schema.Types.Mixed, required: false },
    output: { type: Schema.Types.Mixed, required: false },
    handoff: { type: Schema.Types.Mixed, required: false },
    attempts: { type: [v2JobAttemptSchema], default: [] },
    tokens: { type: Schema.Types.Mixed, required: false },
    over_budget: { type: Boolean, required: false },
    usd_estimate: { type: Number, required: false },
    issues: { type: Schema.Types.Mixed, required: false },
    error: { type: String, required: false },
    lease_expires_at: { type: Date, required: false, index: true },
    worker_id: { type: String, required: false },
  },
  { timestamps: true, collection: 'v2_jobs' },
);

v2JobSchema.index({ status: 1, kind: 1, createdAt: 1 });
v2JobSchema.index({ lesson_id: 1, version: 1, kind: 1 });
v2JobSchema.index({ day: 1, target_lang: 1, version: 1 });

export type V2JobDoc = InferSchemaType<typeof v2JobSchema> & {
  _id: mongoose.Types.ObjectId;
};

export function V2JobModel(): Model<V2JobDoc> {
  // Next.js HMR keeps the first-compiled model (old type enum: generate_lesson only).
  const cached = mongoose.models.V2Job as Model<V2JobDoc> | undefined;
  if (cached) {
    const typePath = cached.schema.path('type') as
      | (mongoose.SchemaType & { enumValues?: string[] })
      | undefined;
    const kindPath = cached.schema.path('kind') as
      | (mongoose.SchemaType & { enumValues?: string[] })
      | undefined;
    const hasNewFields = Boolean(cached.schema.path('handoff'));
    const staleTypeEnum =
      Array.isArray(typePath?.enumValues) && typePath.enumValues.length > 0;
    const kindEnums = kindPath?.enumValues;
    const staleKindEnum =
      !Array.isArray(kindEnums) ||
      kindEnums.length !== V2_JOB_KINDS.length ||
      V2_JOB_KINDS.some((k) => !kindEnums.includes(k));
    if (staleTypeEnum || !kindPath || !hasNewFields || staleKindEnum) {
      delete (mongoose.models as Record<string, unknown>).V2Job;
      delete (mongoose.connection.models as Record<string, unknown>).V2Job;
    } else {
      return cached;
    }
  }
  return mongoose.model<V2JobDoc>('V2Job', v2JobSchema);
}

const v2GenSampleRunSchema = new Schema(
  {
    profile: { type: String, required: true, index: true },
    started_at: { type: Date, required: true },
    finished_at: { type: Date, required: false },
    days: { type: Schema.Types.Mixed, required: true },
    issues_by_rule: { type: Schema.Types.Mixed, required: false },
    tokens_by_kind: { type: Schema.Types.Mixed, required: false },
    time_by_kind: { type: Schema.Types.Mixed, required: false },
    cost_by_kind: { type: Schema.Types.Mixed, required: false },
    over_budget_count: { type: Number, required: false },
    summary: { type: Schema.Types.Mixed, required: false },
  },
  { timestamps: true, collection: 'v2_gen_sample_runs' },
);

export type V2GenSampleRunDoc = InferSchemaType<typeof v2GenSampleRunSchema> & {
  _id: mongoose.Types.ObjectId;
};

export function V2GenSampleRunModel(): Model<V2GenSampleRunDoc> {
  return (
    (mongoose.models.V2GenSampleRun as Model<V2GenSampleRunDoc>) ||
    mongoose.model<V2GenSampleRunDoc>('V2GenSampleRun', v2GenSampleRunSchema)
  );
}

const v2ItemSchema = new Schema(
  {
    target_lang: { type: String, required: true, index: true },
    id: { type: String, required: true },
    type: { type: String, required: true },
    tl: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    first_day: { type: Number, required: true },
  },
  { timestamps: true, collection: 'v2_items' },
);

v2ItemSchema.index({ target_lang: 1, id: 1 }, { unique: true });

export type V2ItemDoc = InferSchemaType<typeof v2ItemSchema> & {
  _id: mongoose.Types.ObjectId;
};

export function V2ItemModel(): Model<V2ItemDoc> {
  return (
    (mongoose.models.V2Item as Model<V2ItemDoc>) ||
    mongoose.model<V2ItemDoc>('V2Item', v2ItemSchema)
  );
}

const v2ReportSchema = new Schema(
  {
    item_id: { type: String, required: false, index: true },
    question_id: { type: String, required: false, index: true },
    day: { type: Number, required: true, index: true },
    note: { type: String, required: true },
    user_id: { type: String, required: false, index: true },
    status: {
      type: String,
      required: true,
      enum: ['open', 'reviewed'],
      default: 'open',
      index: true,
    },
  },
  { timestamps: true, collection: 'v2_reports' },
);

export type V2ReportDoc = InferSchemaType<typeof v2ReportSchema> & {
  _id: mongoose.Types.ObjectId;
};

export function V2ReportModel(): Model<V2ReportDoc> {
  return (
    (mongoose.models.V2Report as Model<V2ReportDoc>) ||
    mongoose.model<V2ReportDoc>('V2Report', v2ReportSchema)
  );
}

const skillSrsSchema = new Schema(
  {
    interval: { type: Number, required: true, default: 0 },
    dueAt: { type: Date, required: false },
    streak: { type: Number, required: true, default: 0 },
    lapses: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

const cardSrsSchema = new Schema(
  {
    interval: { type: Number, required: true, default: 0 },
    dueAt: { type: Date, required: false },
    masteryLevel: {
      type: String,
      required: true,
      enum: ['learning', 'mastered'],
      default: 'learning',
    },
    consecutiveCorrect: { type: Number, required: true, default: 0 },
    face: { type: String, required: true, default: 'recognize' },
    knowCheckDueAt: { type: Date, required: false },
  },
  { _id: false },
);

const v2ItemStateSchema = new Schema(
  {
    user_id: { type: String, required: true, index: true },
    item_id: { type: String, required: true, index: true },
    target_lang: { type: String, required: true, default: 'pt-PT' },
    introducedDay: { type: Number, required: true },
    usedCorrectlyIn: { type: [String], default: [] },
    levels: {
      heard: { type: Number, required: true, default: 0 },
      understood: { type: Number, required: true, default: 0 },
      said: { type: Number, required: true, default: 0 },
      used: { type: Number, required: true, default: 0 },
    },
    skills: { type: Schema.Types.Mixed, default: {} },
    card: { type: cardSrsSchema, required: true },
    lastImplicitReviewLocalDate: { type: String, required: false },
    weakToolIds: { type: [String], default: [] },
    /** Per-user flashcard opt-in (real-world «+ للكروت»). */
    opt_in_card: { type: Boolean, required: false, default: false },
  },
  { timestamps: true, collection: 'v2_item_state' },
);

v2ItemStateSchema.index({ user_id: 1, item_id: 1 }, { unique: true });
v2ItemStateSchema.index({ user_id: 1, 'card.dueAt': 1 });

export type V2ItemStateDoc = InferSchemaType<typeof v2ItemStateSchema> & {
  _id: mongoose.Types.ObjectId;
};

export function V2ItemStateModel(): Model<V2ItemStateDoc> {
  return (
    (mongoose.models.V2ItemState as Model<V2ItemStateDoc>) ||
    mongoose.model<V2ItemStateDoc>('V2ItemState', v2ItemStateSchema)
  );
}

const v2ErrorSchema = new Schema(
  {
    user_id: { type: String, required: true, index: true },
    item_id: { type: String, required: false, index: true },
    tool_id: { type: String, required: false, index: true },
    skill: { type: String, required: false },
    category: { type: String, required: true, index: true },
    scope: { type: String, required: true, index: true },
    wrong: { type: String, required: true },
    right: { type: String, required: true },
    at: { type: Date, required: true, default: () => new Date(), index: true },
  },
  { timestamps: true, collection: 'v2_errors' },
);

export type V2ErrorDoc = InferSchemaType<typeof v2ErrorSchema> & {
  _id: mongoose.Types.ObjectId;
};

export function V2ErrorModel(): Model<V2ErrorDoc> {
  return (
    (mongoose.models.V2Error as Model<V2ErrorDoc>) ||
    mongoose.model<V2ErrorDoc>('V2Error', v2ErrorSchema)
  );
}

const v2SessionQueueItemSchema = new Schema(
  {
    item_id: { type: String, required: true },
    bucket: {
      type: String,
      required: false,
      enum: ['recent', 'weak', 'older'],
    },
    rating: {
      type: String,
      required: false,
      enum: ['again', 'hard', 'easy', 'know'],
    },
    rated_at: { type: Date, required: false },
  },
  { _id: false },
);

const v2SessionSchema = new Schema(
  {
    user_id: { type: String, required: true, index: true },
    kind: {
      type: String,
      required: true,
      enum: ['lesson', 'cards', 'questions', 'practice'],
      index: true,
    },
    local_date: { type: String, required: false, index: true },
    day: { type: Number, required: false },
    status: {
      type: String,
      required: true,
      enum: ['open', 'done'],
      default: 'open',
      index: true,
    },
    queue: { type: [v2SessionQueueItemSchema], default: [] },
    items: { type: Schema.Types.Mixed, default: [] },
    /** Practice: attempts per beat_id (server-side). */
    beat_attempts: { type: Schema.Types.Mixed, required: false },
    /** Practice: per-skill tallies for the end screen. */
    skill_counts: { type: Schema.Types.Mixed, required: false },
    tz: { type: String, required: false },
  },
  { timestamps: true, collection: 'v2_sessions' },
);

v2SessionSchema.index(
  { user_id: 1, kind: 1, local_date: 1 },
  {
    unique: true,
    partialFilterExpression: { kind: 'cards', local_date: { $type: 'string' } },
  },
);

export type V2SessionDoc = InferSchemaType<typeof v2SessionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export function V2SessionModel(): Model<V2SessionDoc> {
  return (
    (mongoose.models.V2Session as Model<V2SessionDoc>) ||
    mongoose.model<V2SessionDoc>('V2Session', v2SessionSchema)
  );
}

const v2QuestionSchema = new Schema(
  {
    id: { type: String, required: true },
    target_lang: { type: String, required: true, default: 'pt-PT' },
    tests: { type: [String], default: [] },
    skill: { type: String, required: true },
    type: { type: String, required: true },
    origin: {
      type: String,
      required: true,
      enum: ['code', 'claude'],
      index: true,
    },
    day: { type: Number, required: false, index: true },
    prompt: { type: Schema.Types.Mixed, required: true },
    options: { type: Schema.Types.Mixed, required: false },
    answer: { type: Schema.Types.Mixed, required: false },
    accepted: { type: [String], required: false },
    tool_id: { type: String, required: false, index: true },
    disabled: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: 'v2_questions' },
);

v2QuestionSchema.index({ id: 1, target_lang: 1 }, { unique: true });
v2QuestionSchema.index({ skill: 1, disabled: 1 });

export type V2QuestionDoc = InferSchemaType<typeof v2QuestionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export function V2QuestionModel(): Model<V2QuestionDoc> {
  return (
    (mongoose.models.V2Question as Model<V2QuestionDoc>) ||
    mongoose.model<V2QuestionDoc>('V2Question', v2QuestionSchema)
  );
}

const v2AnswerIdempotencySchema = new Schema(
  {
    answer_id: { type: String, required: true, unique: true, index: true },
    user_id: { type: String, required: true, index: true },
    verdict: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true, collection: 'v2_answer_idempotency' },
);

export type V2AnswerIdempotencyDoc = InferSchemaType<
  typeof v2AnswerIdempotencySchema
> & {
  _id: mongoose.Types.ObjectId;
};

export function V2AnswerIdempotencyModel(): Model<V2AnswerIdempotencyDoc> {
  return (
    (mongoose.models.V2AnswerIdempotency as Model<V2AnswerIdempotencyDoc>) ||
    mongoose.model<V2AnswerIdempotencyDoc>(
      'V2AnswerIdempotency',
      v2AnswerIdempotencySchema,
    )
  );
}

const V2_PACK_STATUSES = ['draft', 'reviewed', 'published'] as const;

const v2PackSchema = new Schema(
  {
    day: { type: Number, required: true, index: true },
    target_lang: { type: String, required: true, index: true },
    version: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      required: true,
      enum: V2_PACK_STATUSES,
      index: true,
    },
    data: { type: Schema.Types.Mixed, required: true },
    meta: { type: Schema.Types.Mixed, required: false },
  },
  { timestamps: true, collection: 'v2_packs' },
);

v2PackSchema.index({ day: 1, target_lang: 1, version: 1 }, { unique: true });
v2PackSchema.index({ day: 1, target_lang: 1, status: 1 });

export type V2PackDoc = InferSchemaType<typeof v2PackSchema> & {
  _id: mongoose.Types.ObjectId;
};

export function V2PackModel(): Model<V2PackDoc> {
  return (
    (mongoose.models.V2Pack as Model<V2PackDoc>) ||
    mongoose.model<V2PackDoc>('V2Pack', v2PackSchema)
  );
}

const V2_CONVO_PACK_STATUSES = ['draft', 'reviewed', 'published'] as const;

const v2ConvoPackSchema = new Schema(
  {
    day: { type: Number, required: true, index: true },
    target_lang: { type: String, required: true, index: true },
    version: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      required: true,
      enum: V2_CONVO_PACK_STATUSES,
      index: true,
    },
    data: { type: Schema.Types.Mixed, required: true },
    meta: { type: Schema.Types.Mixed, required: false },
  },
  { timestamps: true, collection: 'v2_convo_packs' },
);

v2ConvoPackSchema.index(
  { day: 1, target_lang: 1, version: 1 },
  { unique: true },
);
v2ConvoPackSchema.index({ day: 1, target_lang: 1, status: 1 });

export type V2ConvoPackDoc = InferSchemaType<typeof v2ConvoPackSchema> & {
  _id: mongoose.Types.ObjectId;
};

export function V2ConvoPackModel(): Model<V2ConvoPackDoc> {
  return (
    (mongoose.models.V2ConvoPack as Model<V2ConvoPackDoc>) ||
    mongoose.model<V2ConvoPackDoc>('V2ConvoPack', v2ConvoPackSchema)
  );
}

const V2_STORY_STATUSES = ['draft', 'ready', 'published', 'failed'] as const;

const v2StorySchema = new Schema(
  {
    id: { type: String, required: true, index: true },
    day: { type: Number, required: true, index: true },
    target_lang: { type: String, required: true, index: true },
    version: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      required: true,
      enum: V2_STORY_STATUSES,
      index: true,
    },
    cast: { type: Schema.Types.Mixed, required: true },
    setting: { type: String, required: true },
    lines: { type: Schema.Types.Mixed, required: true },
    image_spec: { type: Schema.Types.Mixed, required: false },
    /** Denormalized ready scene image { key, url }. */
    image: { type: Schema.Types.Mixed, required: false },
    scenes: { type: Schema.Types.Mixed, required: false },
    is_weekly: { type: Boolean, required: false },
    after_questions: { type: Schema.Types.Mixed, required: false },
    reading: { type: Schema.Types.Mixed, required: false },
  },
  { timestamps: true, collection: 'v2_stories' },
);

v2StorySchema.index({ id: 1, version: 1 }, { unique: true });
v2StorySchema.index({ day: 1, target_lang: 1, version: 1 }, { unique: true });
v2StorySchema.index({ day: 1, target_lang: 1, status: 1 });

export type V2StoryDoc = InferSchemaType<typeof v2StorySchema> & {
  _id: mongoose.Types.ObjectId;
};

export function V2StoryModel(): Model<V2StoryDoc> {
  return (
    (mongoose.models.V2Story as Model<V2StoryDoc>) ||
    mongoose.model<V2StoryDoc>('V2Story', v2StorySchema)
  );
}

const V2_IMAGE_STATUSES = [
  'missing',
  'queued',
  'generating',
  'ready',
  'flagged',
  'failed',
  'blocked',
] as const;

const v2ImageSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    kind: {
      type: String,
      required: false,
      enum: ['character_ref', 'style_anchor', 'content'],
      index: true,
    },
    type: { type: String, required: false },
    spec: { type: Schema.Types.Mixed, required: false },
    prompt: { type: String, required: false },
    /** Admin-edited scene description; wins over core-items authored prompt. */
    prompt_override: { type: String, required: false },
    /** How the last generate assembled the scene description. */
    prompt_source: {
      type: String,
      required: false,
      enum: ['authored', 'generated', 'override'],
    },
    status: {
      type: String,
      required: true,
      enum: V2_IMAGE_STATUSES,
      default: 'missing',
      index: true,
    },
    url: { type: String, required: false },
    public_id: { type: String, required: false },
    cloudinary_version: { type: Number, required: false },
    qa: { type: Schema.Types.Mixed, required: false },
    cost_usd: { type: Number, required: false, default: 0 },
    version: { type: Number, required: false, default: 1 },
    used_by: { type: [String], required: false, default: [] },
    reason: { type: String, required: false },
    generating_started_at: { type: Date, required: false },
  },
  { timestamps: true, collection: 'v2_images' },
);

v2ImageSchema.index({ status: 1, kind: 1 });

export type V2ImageDoc = InferSchemaType<typeof v2ImageSchema> & {
  _id: mongoose.Types.ObjectId;
};

export function V2ImageModel(): Model<V2ImageDoc> {
  return (
    (mongoose.models.V2Image as Model<V2ImageDoc>) ||
    mongoose.model<V2ImageDoc>('V2Image', v2ImageSchema)
  );
}

/** Conversation sessions — separate from practice-shaped `v2_sessions` (09 §10). */
const v2ConvoSessionSchema = new Schema(
  {
    _id: { type: String, required: true },
    user_id: { type: String, required: true, index: true },
    module: {
      type: String,
      required: true,
      enum: ['lesson', 'free'],
      default: 'lesson',
    },
    pack_id: { type: String, required: true, index: true },
    topic_id: { type: String, required: false, default: null, index: true },
    character_id: { type: String, required: false, default: null },
    thread_index: { type: Number, required: false, default: 0 },
    free_step: {
      type: Schema.Types.Mixed,
      required: false,
      default: { kind: 'ask' },
    },
    threads_done: { type: [String], required: false, default: [] },
    last_line_id: { type: String, required: false, default: null },
    assisted: { type: Boolean, required: false, default: false },
    off_topic_streak: { type: Number, required: false, default: 0 },
    paused_for_pack_id: { type: String, required: false, default: null },
    rungs: { type: Schema.Types.Mixed, required: true, default: {} },
    help_ladder: {
      type: Schema.Types.Mixed,
      required: true,
      default: { question_id: null, step: 0, attempts: 0 },
    },
    current_group: { type: Number, required: true, default: 1 },
    candidate_history: { type: [String], default: [] },
    last_exchanges: { type: Schema.Types.Mixed, default: [] },
    pending_question: { type: Schema.Types.Mixed, default: null },
    pending_frame: { type: Schema.Types.Mixed, required: false, default: null },
    facts: { type: [String], default: [] },
    suggested_words: { type: [String], default: [] },
    status: {
      type: String,
      required: true,
      enum: ['open', 'done'],
      default: 'open',
      index: true,
    },
    phase: {
      type: String,
      required: true,
      enum: ['teaching', 'recap', 'closing'],
      default: 'teaching',
    },
    correct_streak: { type: Number, required: true, default: 0 },
    struggled: { type: Schema.Types.Mixed, required: true, default: {} },
    said_once: { type: Schema.Types.Mixed, required: true, default: {} },
    coach_recent_ids: { type: [String], required: true, default: [] },
    recap_done_ids: { type: [String], required: true, default: [] },
    survival_used: { type: Number, required: true, default: 0 },
    learner_lines: { type: [String], required: false, default: [] },
    recasts: { type: Schema.Types.Mixed, required: false, default: [] },
    learn_suggest_group: { type: String, required: false, default: null },
    learn_suggest_count: { type: Number, required: false, default: 0 },
    learn_suggest_done: { type: Boolean, required: false, default: false },
    pending_cta: { type: Schema.Types.Mixed, required: false, default: null },
    open_turns: { type: Number, required: false, default: 0 },
    open_fallbacks: { type: Number, required: false, default: 0 },
  },
  { timestamps: true, collection: 'v2_convo_sessions', _id: false },
);

v2ConvoSessionSchema.index(
  { user_id: 1, pack_id: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'open' },
  },
);

export type V2ConvoSessionDoc = InferSchemaType<typeof v2ConvoSessionSchema> & {
  _id: string;
};

export function V2ConvoSessionModel(): Model<V2ConvoSessionDoc> {
  return (
    (mongoose.models.V2ConvoSession as Model<V2ConvoSessionDoc>) ||
    mongoose.model<V2ConvoSessionDoc>('V2ConvoSession', v2ConvoSessionSchema)
  );
}

/** Free-chat angle bank per language × topic (09 §10 / T7.1). */
const v2TopicAnglesSchema = new Schema(
  {
    target_lang: { type: String, required: true, index: true },
    topic_id: { type: String, required: true, index: true },
    version: { type: Number, required: true, min: 1, default: 1 },
    angles: { type: Schema.Types.Mixed, required: true, default: [] },
  },
  { timestamps: true, collection: 'v2_topic_angles' },
);

v2TopicAnglesSchema.index(
  { target_lang: 1, topic_id: 1, version: 1 },
  { unique: true },
);

export type V2TopicAnglesDoc = InferSchemaType<typeof v2TopicAnglesSchema> & {
  _id: mongoose.Types.ObjectId;
};

export function V2TopicAnglesModel(): Model<V2TopicAnglesDoc> {
  return (
    (mongoose.models.V2TopicAngles as Model<V2TopicAnglesDoc>) ||
    mongoose.model<V2TopicAnglesDoc>('V2TopicAngles', v2TopicAnglesSchema)
  );
}

/** Topic requests — free unmatched (09) or Learn «موضوع جديد» (Batch 10 D6). */
const v2TopicRequestSchema = new Schema(
  {
    user_id: { type: String, required: true, index: true },
    query_eg: { type: String, required: true },
    session_id: { type: String, required: false },
    mode: {
      type: String,
      required: false,
      enum: ['learn', 'practice', 'free'],
      default: null,
    },
    created_at: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, collection: 'v2_topic_requests' },
);

export type V2TopicRequestDoc = InferSchemaType<typeof v2TopicRequestSchema> & {
  _id: mongoose.Types.ObjectId;
};

export function V2TopicRequestModel(): Model<V2TopicRequestDoc> {
  return (
    (mongoose.models.V2TopicRequest as Model<V2TopicRequestDoc>) ||
    mongoose.model<V2TopicRequestDoc>('V2TopicRequest', v2TopicRequestSchema)
  );
}

void overrideFormSchema;
void skillSrsSchema;
