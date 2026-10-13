/**
 * Read-only Mongoose models for Langify collections.
 * This module must never export write helpers.
 */
import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const langifyUserProgressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    grammar_cells: { type: [Schema.Types.Mixed], default: [] },
    introduced_words: { type: [Schema.Types.Mixed], default: [] },
    finished_lessons: { type: [Schema.Types.Mixed], default: [] },
    lesson_missions: { type: [Schema.Types.Mixed], default: [] },
  },
  { timestamps: true, collection: 'userprogresses', strict: false },
);

const langifyUserSchema = new Schema(
  {
    email: String,
    name: String,
  },
  { timestamps: true, collection: 'users', strict: false },
);

export type LangifyUserProgressDoc = InferSchemaType<typeof langifyUserProgressSchema> & {
  _id: mongoose.Types.ObjectId;
  grammar_cells?: Array<{
    cell_id?: string;
    verb?: string;
    tense?: string;
    person?: string;
    form?: string;
    status?: string;
  }>;
  introduced_words?: Array<{ word?: string }>;
  finished_lessons?: Array<{
    mission_id?: string;
    lesson_id?: string;
    connected_words?: string[] | Record<string, string[]>;
  }>;
};

export type LangifyUserDoc = InferSchemaType<typeof langifyUserSchema> & {
  _id: mongoose.Types.ObjectId;
};

export function LangifyUserProgressModel(): Model<LangifyUserProgressDoc> {
  return (
    (mongoose.models.LangifyUserProgress as Model<LangifyUserProgressDoc>) ||
    mongoose.model<LangifyUserProgressDoc>(
      'LangifyUserProgress',
      langifyUserProgressSchema,
    )
  );
}

export function LangifyUserModel(): Model<LangifyUserDoc> {
  return (
    (mongoose.models.LangifyUser as Model<LangifyUserDoc>) ||
    mongoose.model<LangifyUserDoc>('LangifyUser', langifyUserSchema)
  );
}
