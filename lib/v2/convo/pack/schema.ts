import { z } from 'zod';

/** Choice question (👆): character line that contains the target item among options. */
export const ConvoChoiceQuestionSchema = z.object({
  id: z.string().min(1),
  /** Character line in pt-PT; must contain the item surface. */
  tl: z.string().min(1),
  /** Simple MSA translation of the character line. */
  ar: z.string().min(1).optional(),
  /** Option item ids (2–3). */
  option_ids: z.array(z.string().min(1)).min(2).max(3),
  /** Correct option item id (must be in option_ids). */
  correct_id: z.string().min(1),
  /** Map node this question highlights. */
  map_node: z.string().min(1).optional(),
  /** Map route step this question needs. */
  map_step: z.string().min(1).optional(),
  /** Scene-card hotspot this question needs. */
  hotspot_id: z.string().min(1).optional(),
});

/** Help-ladder lines for one open question (steps 1–2 authored; step 3 built later). */
export const ConvoHelpLadderSchema = z.object({
  /** Step 1: simpler re-ask by the character. */
  step1_reask_tl: z.string().min(1),
  /** MSA translation of the step-1 re-ask. */
  step1_reask_ar: z.string().min(1).optional(),
  /** Step 2: coach hint giving the start of the answer (Egyptian). */
  step2_hint_eg: z.string().min(1),
});

/** Open question (🗣): requires the item without containing it. */
export const ConvoOpenQuestionSchema = z.object({
  id: z.string().min(1),
  /** Character line in pt-PT; must NOT contain the item surface. */
  tl: z.string().min(1),
  /** Simple MSA translation of the character line. */
  ar: z.string().min(1).optional(),
  /** Expected answer item id. */
  item_id: z.string().min(1),
  /** Map node this question highlights. */
  map_node: z.string().min(1).optional(),
  /** Map route step this question needs (map visuals). */
  map_step: z.string().min(1).optional(),
  /** Scene-card hotspot this question needs. */
  hotspot_id: z.string().min(1).optional(),
  help_ladder: ConvoHelpLadderSchema.optional(),
});

/** Listed common mistake with story consequence. */
export const ConvoMistakeSchema = z.object({
  id: z.string().min(1),
  /** Learner text or item id that triggers this mistake. */
  trigger: z.string().min(1),
  /** In-story consequence for the reaction prompt. */
  consequence_tl: z.string().min(1),
  /** One-line coach note in Egyptian. */
  coach_note_eg: z.string().min(1),
});

/** Per-item bank; card data stays on the lesson item (reference by id only). */
export const ConvoItemBankSchema = z.object({
  coach_intro_eg: z.string().min(1),
  memory_trick_eg: z.string().min(1).optional(),
  /** Domain check requires ≥1; empty allowed here so validate can emit choice_min. */
  choice_questions: z.array(ConvoChoiceQuestionSchema).default([]),
  /** Domain check requires ≥1; empty allowed here so validate can emit open_min. */
  open_questions: z.array(ConvoOpenQuestionSchema).default([]),
  common_mistakes: z.array(ConvoMistakeSchema).max(2).default([]),
});

export const ConvoMapNodeKindSchema = z.enum(['place', 'home', 'far_place']);

export const ConvoMapNodeSchema = z.object({
  id: z.string().min(1),
  label_tl: z.string().min(1),
  /** 0–100 horizontal position on the illustrated map. */
  x: z.number().min(0).max(100).optional(),
  /** 0–100 vertical position on the illustrated map. */
  y: z.number().min(0).max(100).optional(),
  kind: ConvoMapNodeKindSchema.optional(),
  /** Lesson item id when this node is a place the learner names. */
  item_id: z.string().min(1).optional(),
});

export const ConvoMapArrowSchema = z.enum(['left', 'right', 'straight']);

export const ConvoMapRouteStepSchema = z.object({
  step_id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  item_id: z.string().min(1),
  arrow: ConvoMapArrowSchema.optional(),
});

export const ConvoMapVisualSchema = z.object({
  type: z.literal('map'),
  nodes: z.array(ConvoMapNodeSchema).min(2),
  route: z.array(ConvoMapRouteStepSchema).min(1),
});

export const ConvoHotspotSchema = z.object({
  id: z.string().min(1),
  item_id: z.string().min(1),
});

export const ConvoSceneCardVisualSchema = z.object({
  type: z.literal('scene_card'),
  image_key: z.string().min(1),
  hotspots: z.array(ConvoHotspotSchema).default([]),
});

export const ConvoVisualSchema = z.discriminatedUnion('type', [
  ConvoMapVisualSchema,
  ConvoSceneCardVisualSchema,
]);

export const ConvoGroupSchema = z.object({
  id: z.string().min(1),
  /** Core (+ optional recycled) item ids for this group. */
  item_ids: z.array(z.string().min(1)).min(1).max(5),
  /** One Egyptian coach line that introduces the whole group. */
  intro_eg: z.string().min(1).optional(),
});

export const ConvoRecapQuestionSchema = z.object({
  id: z.string().min(1),
  tl: z.string().min(1),
  ar: z.string().min(1).optional(),
  item_id: z.string().min(1),
});

export const ConvoRecapSchema = z.object({
  framing_eg: z.string().min(1).optional(),
  intro_tl: z.string().min(1).optional(),
  intro_ar: z.string().min(1).optional(),
  questions: z.array(ConvoRecapQuestionSchema).min(1),
});

export const ConvoCharacterLineSchema = z.object({
  tl: z.string().min(1),
  ar: z.string().min(1).optional(),
  say: z.string().min(1).optional(),
});

export const ConvoSceneSchema = z.object({
  character_id: z.string().min(1),
  place: z.string().min(1),
  /** Why they are talking (information gap). */
  information_gap: z.string().min(1),
});

export const ConvoPackDataSchema = z.object({
  pack_id: z.string().min(1),
  day: z.number().int().positive(),
  target_lang: z.string().min(1).default('pt-PT'),
  /** Hand-authored reference pack (skips some generation-only strictness). */
  authored: z.boolean().optional(),
  note: z.string().min(1).optional(),
  scene: ConvoSceneSchema,
  visual: ConvoVisualSchema,
  /** Ordered groups; max 4. */
  groups: z.array(ConvoGroupSchema).min(1).max(4),
  /** Per core item bank, keyed by lesson item id. */
  items: z.record(z.string().min(1), ConvoItemBankSchema),
  recap: ConvoRecapSchema,
  opening: ConvoCharacterLineSchema,
  closing: ConvoCharacterLineSchema,
  bridge: ConvoCharacterLineSchema,
});

export type ConvoChoiceQuestion = z.infer<typeof ConvoChoiceQuestionSchema>;
export type ConvoHelpLadder = z.infer<typeof ConvoHelpLadderSchema>;
export type ConvoOpenQuestion = z.infer<typeof ConvoOpenQuestionSchema>;
export type ConvoMistake = z.infer<typeof ConvoMistakeSchema>;
export type ConvoItemBank = z.infer<typeof ConvoItemBankSchema>;
export type ConvoMapNode = z.infer<typeof ConvoMapNodeSchema>;
export type ConvoMapVisual = z.infer<typeof ConvoMapVisualSchema>;
export type ConvoSceneCardVisual = z.infer<typeof ConvoSceneCardVisualSchema>;
export type ConvoVisual = z.infer<typeof ConvoVisualSchema>;
export type ConvoGroup = z.infer<typeof ConvoGroupSchema>;
export type ConvoRecap = z.infer<typeof ConvoRecapSchema>;
export type ConvoCharacterLine = z.infer<typeof ConvoCharacterLineSchema>;
export type ConvoScene = z.infer<typeof ConvoSceneSchema>;
export type ConvoPackData = z.infer<typeof ConvoPackDataSchema>;

/** Glyph on the inline item card (T1.13). */
export type ConvoItemGlyph = 'left' | 'right' | 'straight' | 'place';

/** Minimal surface needed to check choice/open containment + card UI. */
export type ConvoItemSurface = {
  id: string;
  /** Target-language form used in containment checks (e.g. "à direita"). */
  tl: string;
  /** Arabic-letter pronunciation for the card. */
  say?: string;
  /** Card visual: arrow or place placeholder. */
  glyph?: ConvoItemGlyph;
};
