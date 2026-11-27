/**
 * لقطات / Micro clips Mongo models (19-micro-clips.md §8).
 * Split from models.ts for Turbopack HMR safety (same pattern as libraryModels).
 */
import mongoose, {
  type InferSchemaType,
  type Model,
  Schema,
} from 'mongoose';

const regionBoxSchema = new Schema(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
  },
  { _id: false },
);

const clipLineSchema = new Schema(
  {
    item_id: { type: String, required: true },
    icon_key: { type: String, required: false },
    tl: { type: String, required: true },
    ar: { type: String, required: true },
    pos: { type: String, required: true },
    concept_en: { type: String, required: false },
    region_hint: { type: String, required: false },
    /** Short 2–3 word scene label (§3.2b). */
    region_label: { type: String, required: false },
    box: { type: regionBoxSchema, required: false },
    box_flagged: { type: Boolean, required: false, default: false },
    /** For rule layout: start/end char offsets of the highlighted ending in tl. */
    highlight: {
      type: new Schema(
        {
          start: { type: Number, required: true },
          end: { type: Number, required: true },
        },
        { _id: false },
      ),
      required: false,
    },
    verb_lemma: { type: String, required: false },
  },
  { _id: false },
);

const scenePlanObjectSchema = new Schema(
  {
    id: { type: String, required: true },
    label_en: { type: String, required: true },
    zone: {
      type: String,
      required: true,
      enum: ['near', 'middle', 'far'],
    },
    default_box: { type: regionBoxSchema, required: true },
  },
  { _id: false },
);

const ruleCardSchema = new Schema(
  {
    pattern_tl: { type: String, required: true },
    pattern_ar: { type: String, required: false },
    ending_table: {
      type: [
        new Schema(
          {
            label: { type: String, required: true },
            from: { type: String, required: true },
            to: { type: String, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { _id: false },
);

const v2MicroSeriesSchema = new Schema(
  {
    target_lang: { type: String, required: true, index: true },
    slug: { type: String, required: true },
    title_ar: { type: String, required: true },
    title_tl: { type: String, required: true },
    order: { type: Number, required: true },
    status: {
      type: String,
      required: true,
      enum: ['draft', 'published'],
      default: 'draft',
      index: true,
    },
    official_deck_id: { type: String, required: false },
  },
  { timestamps: true, collection: 'v2_micro_series' },
);

v2MicroSeriesSchema.index({ target_lang: 1, slug: 1 }, { unique: true });
v2MicroSeriesSchema.index({ target_lang: 1, order: 1 });

export type V2MicroSeriesDoc = InferSchemaType<typeof v2MicroSeriesSchema> & {
  _id: mongoose.Types.ObjectId;
};

export function V2MicroSeriesModel(): Model<V2MicroSeriesDoc> {
  return (
    (mongoose.models.V2MicroSeries as Model<V2MicroSeriesDoc>) ||
    mongoose.model<V2MicroSeriesDoc>('V2MicroSeries', v2MicroSeriesSchema)
  );
}

const v2MicroClipSchema = new Schema(
  {
    series_id: { type: String, required: true, index: true },
    series_slug: { type: String, required: true, index: true },
    target_lang: { type: String, required: true, index: true },
    slug: { type: String, required: true },
    order: { type: Number, required: true },
    layout: {
      type: String,
      required: true,
      enum: ['list', 'pairs', 'scene', 'rule'],
    },
    level: { type: Number, required: true, min: 1, max: 5 },
    title_ar: { type: String, required: true },
    title_tl: { type: String, required: true },
    note: { type: String, required: false },
    rule_card: { type: ruleCardSchema, required: false },
    main_image_key: { type: String, required: false },
    main_image_aspect: { type: String, required: false, default: '4:3' },
    /** Shared scene identity (§3.2b) — clips with the same key share one main picture. */
    scene_key: { type: String, required: false, index: true },
    scene_plan: {
      type: new Schema(
        {
          objects: { type: [scenePlanObjectSchema], default: [] },
        },
        { _id: false },
      ),
      required: false,
    },
    pointer_from: {
      type: new Schema(
        {
          x: { type: Number, required: true },
          y: { type: Number, required: true },
        },
        { _id: false },
      ),
      required: false,
    },
    lines: { type: [clipLineSchema], default: [] },
    legacy_ref: { type: String, required: false },
    status: {
      type: String,
      required: true,
      enum: ['draft', 'ready', 'published'],
      default: 'draft',
      index: true,
    },
    draft_reason: { type: String, required: false },
    generation_cost: { type: Number, required: false, default: 0 },
    generation_tokens: { type: Number, required: false, default: 0 },
    image_spec: { type: Schema.Types.Mixed, required: false },
  },
  { timestamps: true, collection: 'v2_micro_clips' },
);

v2MicroClipSchema.index({ series_id: 1, order: 1 });
v2MicroClipSchema.index({ target_lang: 1, slug: 1 }, { unique: true });
v2MicroClipSchema.index({ status: 1, target_lang: 1 });

export type V2MicroClipDoc = InferSchemaType<typeof v2MicroClipSchema> & {
  _id: mongoose.Types.ObjectId;
};

export function V2MicroClipModel(): Model<V2MicroClipDoc> {
  return (
    (mongoose.models.V2MicroClip as Model<V2MicroClipDoc>) ||
    mongoose.model<V2MicroClipDoc>('V2MicroClip', v2MicroClipSchema)
  );
}

const v2MicroProgressSchema = new Schema(
  {
    user_id: { type: String, required: true, index: true },
    clip_id: { type: String, required: true },
    started_at: { type: Date, required: false },
    finished_at: { type: Date, required: false },
    replays: { type: Number, required: true, default: 0 },
    revealed_count: { type: Number, required: true, default: 0 },
    last_reviewed_at: { type: Date, required: false },
    review_count: { type: Number, required: true, default: 0 },
  },
  { timestamps: true, collection: 'v2_micro_progress' },
);

v2MicroProgressSchema.index({ user_id: 1, clip_id: 1 }, { unique: true });

export type V2MicroProgressDoc = InferSchemaType<
  typeof v2MicroProgressSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export function V2MicroProgressModel(): Model<V2MicroProgressDoc> {
  return (
    (mongoose.models.V2MicroProgress as Model<V2MicroProgressDoc>) ||
    mongoose.model<V2MicroProgressDoc>(
      'V2MicroProgress',
      v2MicroProgressSchema,
    )
  );
}

const v2MicroDailySchema = new Schema(
  {
    user_id: { type: String, required: true, index: true },
    local_date: { type: String, required: true },
    clip_id: { type: String, required: true },
  },
  { timestamps: true, collection: 'v2_micro_daily' },
);

v2MicroDailySchema.index({ user_id: 1, local_date: 1 }, { unique: true });

export type V2MicroDailyDoc = InferSchemaType<typeof v2MicroDailySchema> & {
  _id: mongoose.Types.ObjectId;
};

export function V2MicroDailyModel(): Model<V2MicroDailyDoc> {
  return (
    (mongoose.models.V2MicroDaily as Model<V2MicroDailyDoc>) ||
    mongoose.model<V2MicroDailyDoc>('V2MicroDaily', v2MicroDailySchema)
  );
}
