import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const v2RoleplaySessionSchema = new Schema(
  {
    _id: { type: String, required: true },
    user_id: { type: String, required: true, index: true },
    situation_id: { type: String, required: true, index: true },
    tier: { type: Number, required: true, min: 1, max: 3 },
    current_step_id: { type: String, required: false, default: null },
    slots: { type: Schema.Types.Mixed, required: true, default: {} },
    misses: { type: Schema.Types.Mixed, required: true, default: {} },
    alone_steps: { type: [String], required: true, default: [] },
    assisted_steps: { type: [String], required: true, default: [] },
    key_phrases_said: { type: [String], required: true, default: [] },
    gender: { type: String, required: true, enum: ['m', 'f'], default: 'm' },
    learner_name: { type: String, required: false, default: null },
    status: {
      type: String,
      required: true,
      enum: ['active', 'done'],
      default: 'active',
      index: true,
    },
    exchanges: { type: Schema.Types.Mixed, required: true, default: [] },
    corrections: { type: Schema.Types.Mixed, required: true, default: [] },
    model_calls: { type: Number, required: true, default: 0 },
  },
  { timestamps: true, collection: 'v2_roleplay_sessions', _id: false },
);

v2RoleplaySessionSchema.index(
  { user_id: 1, situation_id: 1, tier: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active' },
  },
);

export type V2RoleplaySessionDoc = InferSchemaType<
  typeof v2RoleplaySessionSchema
> & {
  _id: string;
};

export function V2RoleplaySessionModel(): Model<V2RoleplaySessionDoc> {
  return (
    (mongoose.models.V2RoleplaySession as Model<V2RoleplaySessionDoc>) ||
    mongoose.model<V2RoleplaySessionDoc>(
      'V2RoleplaySession',
      v2RoleplaySessionSchema,
    )
  );
}

/** Stars earned per situation (bits for tiers 1–3). */
const v2RoleplayStarsSchema = new Schema(
  {
    user_id: { type: String, required: true, index: true },
    situation_id: { type: String, required: true, index: true },
    /** Tier numbers completed: subset of [1,2,3]. */
    stars: { type: [Number], required: true, default: [] },
  },
  { timestamps: true, collection: 'v2_roleplay_stars' },
);

v2RoleplayStarsSchema.index(
  { user_id: 1, situation_id: 1 },
  { unique: true },
);

export type V2RoleplayStarsDoc = InferSchemaType<
  typeof v2RoleplayStarsSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export function V2RoleplayStarsModel(): Model<V2RoleplayStarsDoc> {
  return (
    (mongoose.models.V2RoleplayStars as Model<V2RoleplayStarsDoc>) ||
    mongoose.model<V2RoleplayStarsDoc>(
      'V2RoleplayStars',
      v2RoleplayStarsSchema,
    )
  );
}
