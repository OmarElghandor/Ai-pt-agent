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
  'outline',
  'page',
  'critic',
  'questions',
  'micro',
  'daily_use',
  'continuity',
  'assemble',
  'lang_check',
  'image_specs',
] as const;

export type V2JobKind = (typeof V2_JOB_KINDS)[number];

const V2_JOB_STATUSES = [
  'queued',
  'running',
  'done',
  'failed',
  'stale',
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
    const kindPath = cached.schema.path('kind');
    const hasNewFields = Boolean(cached.schema.path('handoff'));
    const staleTypeEnum =
      Array.isArray(typePath?.enumValues) && typePath.enumValues.length > 0;
    if (staleTypeEnum || !kindPath || !hasNewFields) {
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

void overrideFormSchema;
