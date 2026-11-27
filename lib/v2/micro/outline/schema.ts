import { z } from 'zod';

export const MicroLayoutSchema = z.enum(['list', 'pairs', 'scene', 'rule']);
export type MicroLayout = z.infer<typeof MicroLayoutSchema>;

export const RegionBoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});

export const OutlineAuthoredLineSchema = z.object({
  tl: z.string().min(1),
  ar: z.string().min(1),
  pos: z.enum(['noun', 'verb', 'adjective', 'phrase']),
  concept_en: z.string().optional(),
  icon_spec: z.string().optional(),
  region_hint: z.string().optional(),
  /** Short 2–3 word scene label (§3.2b). */
  region_label: z.string().optional(),
  verb_lemma: z.string().optional(),
  box: RegionBoxSchema.optional(),
});

export const OutlineRuleCardSchema = z.object({
  pattern_tl: z.string().min(1),
  pattern_ar: z.string().optional(),
  ending_table: z
    .array(
      z.object({
        label: z.string(),
        from: z.string(),
        to: z.string(),
      }),
    )
    .optional(),
});

export const ScenePlanObjectSchema = z.object({
  id: z.string().min(1),
  label_en: z.string().min(1),
  zone: z.enum(['near', 'middle', 'far']),
  default_box: RegionBoxSchema,
});

export const ScenePlanSchema = z.object({
  objects: z.array(ScenePlanObjectSchema).min(1),
});

export const OutlineRuleKindSchema = z.enum(['verb_ending', 'pattern']);
export const OutlineRuleTenseSchema = z.enum([
  'pres',
  'pret',
  'imperf',
  'fut',
  'inf',
]);
export const OutlineRulePersonSchema = z.enum([
  'eu',
  'tu',
  'ele',
  'nos',
  'eles',
]);

export const OutlineClipSchema = z.object({
  slug: z.string().min(1),
  order: z.number().int().positive(),
  layout: MicroLayoutSchema,
  level: z.number().int().min(1).max(5),
  title_ar: z.string().min(1),
  title_tl: z.string().min(1),
  legacy_ref: z.string().optional(),
  prompt_guidance: z.string().optional(),
  extra_brief: z.string().optional(),
  note: z.string().optional(),
  rule_card: OutlineRuleCardSchema.optional(),
  /** verb_ending = conjugation induction; pattern = fixed tokens to highlight. */
  rule_kind: OutlineRuleKindSchema.optional(),
  rule_tense: OutlineRuleTenseSchema.optional(),
  /** One person or several; a line may match any listed person. */
  rule_person: z
    .union([
      OutlineRulePersonSchema,
      z.array(OutlineRulePersonSchema).min(1),
    ])
    .optional(),
  rule_highlight: z.array(z.string().min(1)).optional(),
  /** Shared scene identity across clips (§3.2b). */
  scene_key: z.string().optional(),
  scene_plan: ScenePlanSchema.optional(),
  pointer_from: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
    })
    .optional(),
  /** Exact English subject for the main picture when authored. */
  image_spec: z.string().optional(),
  /** When present, generation skips the model call (19 §5 authored override). */
  authored_lines: z.array(OutlineAuthoredLineSchema).optional(),
  ready: z.boolean().optional().default(false),
});

export const OutlineSeriesSchema = z.object({
  slug: z.string().min(1),
  order: z.number().int().positive(),
  title_ar: z.string().min(1),
  title_tl: z.string().min(1),
  clips: z.array(OutlineClipSchema).min(1),
});

export const MicroOutlineSchema = z.object({
  target_lang: z.string().min(1),
  series: z.array(OutlineSeriesSchema).min(1),
});

export type OutlineClip = z.infer<typeof OutlineClipSchema>;
export type OutlineSeries = z.infer<typeof OutlineSeriesSchema>;
export type MicroOutline = z.infer<typeof MicroOutlineSchema>;
export type ScenePlan = z.infer<typeof ScenePlanSchema>;
