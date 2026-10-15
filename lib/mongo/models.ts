/**
 * This project's write collections — all practice_* prefixed.
 * Langify collections are never modeled here (see lib/langifyRead).
 */
import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const PRACTICE_LESSON_STATUSES = [
  'spec',
  'generating',
  'live',
  'reviewed',
  'updating',
  'failed',
  'needs_review',
] as const;

const practiceLessonSchema = new Schema(
  {
    lesson_key: { type: String, required: true, index: true },
    version: { type: Number, required: true, min: 1 },
    is_current: { type: Boolean, default: false, index: true },
    topic: { type: String, required: true },
    depth_tier: { type: Number, required: true },
    cefr_level: { type: String, required: true },
    curriculum_point: { type: Number, required: true },
    cell_fingerprint: { type: String, required: true },
    cell_ids: { type: [String], default: [] },
    status: {
      type: String,
      required: true,
      enum: PRACTICE_LESSON_STATUSES,
    },
    spec: { type: Schema.Types.Mixed, default: null },
    pack: { type: Schema.Types.Mixed, default: null },
    requirements: {
      cells: { type: [String], default: [] },
      words: { type: [String], default: [] },
    },
    validator_warnings: { type: [Schema.Types.Mixed], default: [] },
    reviewer_issues: { type: [Schema.Types.Mixed], default: [] },
    needs_omar_review: { type: Boolean, default: false },
    omar_flag_reason: { type: String, default: null },
    failed_attempt: { type: Schema.Types.Mixed, default: null },
    generation_error: { type: String, default: null },
    /** In-flight stage while calling Anthropic (no job queue). */
    generation_stage: { type: String, default: null },
    generation_log: { type: Schema.Types.Mixed, default: {} },
    audio_cache_refs: {
      type: [{ key: String, url: String, language: String }],
      default: [],
    },
  },
  { timestamps: true, collection: 'practice_lessons' },
);

practiceLessonSchema.index({ lesson_key: 1, version: 1 }, { unique: true });
practiceLessonSchema.index({ lesson_key: 1, is_current: 1 });

const practiceGenerationJobSchema = new Schema(
  {
    lesson_key: { type: String, required: true, index: true },
    status: {
      type: String,
      required: true,
      enum: ['queued', 'running', 'done', 'failed'],
      default: 'queued',
      index: true,
    },
    stage: { type: String, default: 'queued' },
    error: { type: String, default: null },
    priority: { type: Number, default: 0 },
    lock: {
      owner: { type: String, default: null },
      acquired_at: { type: Date, default: null },
      last_stage_at: { type: Date, default: null },
    },
  },
  { timestamps: true, collection: 'practice_generation_jobs' },
);

practiceGenerationJobSchema.index({ status: 1, priority: 1, createdAt: 1 });

const practiceProgressSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    cells: {
      type: [
        {
          cell_id: { type: String, required: true },
          practised_at: { type: Date, default: null },
          assessed_at: { type: Date, default: null },
        },
      ],
      default: [],
    },
    lessons: {
      type: [
        {
          lesson_key: { type: String, required: true },
          version: { type: Number, default: 1 },
          started_at: { type: Date, default: null },
          finished_at: { type: Date, default: null },
          assessment_due_at: { type: Date, default: null },
          assessment_result: { type: Schema.Types.Mixed, default: null },
          helped_items: { type: [String], default: [] },
        },
      ],
      default: [],
    },
  },
  { timestamps: true, collection: 'practice_progress' },
);

const practiceChatStateSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    lesson_key: { type: String, default: null },
    state: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'practice_chat_state' },
);

practiceChatStateSchema.index({ userId: 1, lesson_key: 1 });

const practiceNewAnswersSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    lesson_key: { type: String, required: true },
    item_id: { type: String, default: null },
    answer: { type: String, required: true },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'practice_new_answers' },
);

export type PracticeLessonDoc = InferSchemaType<typeof practiceLessonSchema> & {
  _id: mongoose.Types.ObjectId;
};

export type PracticeGenerationJobDoc = InferSchemaType<
  typeof practiceGenerationJobSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export type PracticeProgressDoc = InferSchemaType<typeof practiceProgressSchema> & {
  _id: mongoose.Types.ObjectId;
};

export type PracticeChatStateDoc = InferSchemaType<typeof practiceChatStateSchema> & {
  _id: mongoose.Types.ObjectId;
};

export type PracticeNewAnswerDoc = InferSchemaType<typeof practiceNewAnswersSchema> & {
  _id: mongoose.Types.ObjectId;
};

export function PracticeLessonModel(): Model<PracticeLessonDoc> {
  // Next.js HMR keeps the first-compiled model (old status enum without needs_review).
  const cached = mongoose.models.PracticeLessonOwned as Model<PracticeLessonDoc> | undefined;
  if (cached) {
    const path = cached.schema.path('status') as
      | (mongoose.SchemaType & { enumValues?: string[] })
      | undefined;
    const hasNeedsReview = path?.enumValues?.includes('needs_review');
    if (!hasNeedsReview) {
      delete mongoose.models.PracticeLessonOwned;
      delete mongoose.connection.models.PracticeLessonOwned;
    } else {
      return cached;
    }
  }
  return mongoose.model<PracticeLessonDoc>('PracticeLessonOwned', practiceLessonSchema);
}

export function PracticeGenerationJobModel(): Model<PracticeGenerationJobDoc> {
  return (
    (mongoose.models.PracticeGenerationJob as Model<PracticeGenerationJobDoc>) ||
    mongoose.model<PracticeGenerationJobDoc>(
      'PracticeGenerationJob',
      practiceGenerationJobSchema,
    )
  );
}

export function PracticeProgressModel(): Model<PracticeProgressDoc> {
  return (
    (mongoose.models.PracticeProgress as Model<PracticeProgressDoc>) ||
    mongoose.model<PracticeProgressDoc>('PracticeProgress', practiceProgressSchema)
  );
}

export function PracticeChatStateModel(): Model<PracticeChatStateDoc> {
  return (
    (mongoose.models.PracticeChatState as Model<PracticeChatStateDoc>) ||
    mongoose.model<PracticeChatStateDoc>('PracticeChatState', practiceChatStateSchema)
  );
}

export function PracticeNewAnswersModel(): Model<PracticeNewAnswerDoc> {
  return (
    (mongoose.models.PracticeNewAnswers as Model<PracticeNewAnswerDoc>) ||
    mongoose.model<PracticeNewAnswerDoc>('PracticeNewAnswers', practiceNewAnswersSchema)
  );
}
