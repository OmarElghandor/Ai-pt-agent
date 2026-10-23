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

// silence unused when schema helpers change
void overrideFormSchema;
