import { z } from 'zod';

export const BeatSkillSchema = z.enum(['listening', 'reading', 'speaking', 'writing']);

export const AgentModeSchema = z.enum([
  'practice',
  'daily',
  'open_question',
  'assessment',
]);

export const ErrorCategorySchema = z.enum([
  'grammar',
  'vocabulary',
  'spelling',
  'pronunciation',
]);

export const ErrorScopeSchema = z.enum([
  'verb_form',
  'agreement',
  'sentence_structure',
  'preposition',
  'forgot_word',
  'wrong_word',
  'brazilian',
  'accent',
  'spelling',
  'sound',
]);

export const GradeVerdictSchema = z.enum([
  'correct',
  'near_miss',
  'wrong',
  'off_topic',
  'arabic_only',
  'unclear',
]);

export const GradeErrorSchema = z.object({
  category: ErrorCategorySchema,
  scope: ErrorScopeSchema,
  item_id: z.string().optional(),
  tool_id: z.string().optional(),
  wrong: z.string(),
  right: z.string(),
});

export const GradeRequestSchema = z.object({
  mode: AgentModeSchema.default('practice'),
  level: z.string().default('A0'),
  learner_gender: z.enum(['m', 'f', 'unknown']).optional().default('unknown'),
  skill: BeatSkillSchema,
  prompt_pt: z.string(),
  accepted: z.array(z.string()).optional(),
  criterion: z.string().optional(),
  target_items: z.array(z.string()).default([]),
  tool_id: z.string().optional(),
  weak_areas: z.array(z.string()).default([]),
  known_items: z.array(z.string()).default([]),
  answer: z.string(),
  answer_source: z.enum(['typed', 'speech']).default('typed'),
});

export const GradeResponseSchema = z.object({
  verdict: GradeVerdictSchema,
  items_used_correctly: z.array(z.string()).max(20),
  errors: z.array(GradeErrorSchema).max(3),
  main_error: z.number().int().nullable(),
  corrected_tl: z.string(),
  feedback_ar: z.string(),
  skill: BeatSkillSchema,
});

export type GradeRequest = z.infer<typeof GradeRequestSchema>;
export type GradeResponse = z.infer<typeof GradeResponseSchema>;
export type GradeError = z.infer<typeof GradeErrorSchema>;

export function unclearGrade(skill: z.infer<typeof BeatSkillSchema>): GradeResponse {
  return {
    verdict: 'unclear',
    items_used_correctly: [],
    errors: [],
    main_error: null,
    corrected_tl: '',
    feedback_ar: '',
    skill,
  };
}
