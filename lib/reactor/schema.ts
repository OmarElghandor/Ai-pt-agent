import { z } from 'zod';
import {
  AgentModeSchema,
  BeatSkillSchema,
  ErrorCategorySchema,
  ErrorScopeSchema,
  GradeVerdictSchema,
} from '@/lib/grader/schema';

export const ReactMainErrorSchema = z.object({
  category: ErrorCategorySchema,
  scope: ErrorScopeSchema,
  wrong: z.string(),
  right: z.string(),
  feedback_ar: z.string().optional(),
});

export const ReactRequestSchema = z.object({
  mode: AgentModeSchema.default('practice'),
  level: z.string().default('A0'),
  skill: BeatSkillSchema.default('speaking'),
  verdict: GradeVerdictSchema,
  prompt_pt: z.string().default(''),
  line_ar: z.string().optional(),
  answer: z.string(),
  corrected_tl: z.string().default(''),
  main_error: ReactMainErrorSchema.nullable().optional(),
  weak_spot: z.boolean().default(false),
  character_name: z.string().default('Rita'),
  character_role: z.string().default('in Portugal'),
  reaction_cue: z.string().default('warm and natural'),
  next_line_pt: z.string().optional(),
  next_speaker: z.string().optional(),
  words: z.string().optional(),
  recent: z.array(z.string()).default([]),
  /** When true, only the character reacts (personal slot / empty reply). */
  reaction_kind: z.enum(['r1', 'r2', 'r3']).default('r2'),
});

export const ReactResponseSchema = z.object({
  text: z.string(),
  mode: AgentModeSchema,
  skill: BeatSkillSchema,
  verdict: GradeVerdictSchema,
});

export type ReactRequest = z.infer<typeof ReactRequestSchema>;
export type ReactResponse = z.infer<typeof ReactResponseSchema>;
