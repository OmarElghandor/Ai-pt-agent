import { z } from 'zod';
import { SkillSchema } from './lesson';

export const SkillMixSchema = z.object({
  speaking: z.number().nonnegative().default(0.3),
  listening: z.number().nonnegative().default(0.3),
  reading: z.number().nonnegative().default(0.2),
  writing: z.number().nonnegative().default(0.2),
});

export const ListeningOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  lang: z.enum(['tl', 'ar', 'num']),
  correct: z.boolean(),
});

export const ReadingArtifactSchema = z.object({
  kind: z.enum(['receipt', 'sign', 'label', 'menu']),
  lines: z
    .array(
      z.object({
        tl: z.string().min(1),
        ids: z.array(z.string()).default([]),
      }),
    )
    .min(1),
});

export const PackBeatSchema = z.object({
  id: z.string().min(1),
  skill: SkillSchema,
  /** Character / prompt lines — must be heard (or non-phrase) items. */
  prompt_ids: z.array(z.string()).default([]),
  /** Learner expected lines — must be said (or non-phrase) items. */
  expected_ids: z.array(z.string()).default([]),
  prompt_tl: z.string().optional(),
  narration_eg: z.string().optional(),
  coach_fallback_eg: z.string().min(1),
  /** Authored next character line after a correct / closed advance (no reactor). */
  next_character_tl: z.string().optional(),
  audio_tl: z.string().optional(),
  question_eg: z.string().optional(),
  options: z.array(ListeningOptionSchema).optional(),
  artifact: ReadingArtifactSchema.optional(),
  expected_tl: z.string().optional(),
  accepted: z.array(z.string()).optional(),
  frame_eg: z.string().optional(),
});

export const PackCharacterSchema = z.object({
  id: z.string().min(1),
  name_tl: z.string().min(1),
  name_eg: z.string().optional(),
  role_eg: z.string().optional(),
});

export const PracticePackDataSchema = z.object({
  day: z.number().int().positive(),
  target_lang: z.string().default('pt-PT'),
  character: PackCharacterSchema,
  situation: z
    .object({
      tl: z.string(),
      eg: z.string(),
    })
    .optional(),
  mission_eg: z.string().optional(),
  skill_mix: SkillMixSchema.default({
    speaking: 0.3,
    listening: 0.3,
    reading: 0.2,
    writing: 0.2,
  }),
  /** Draft may be empty; assemble validates 8–14. */
  beats: z.array(PackBeatSchema).max(14),
});

export type SkillMix = z.infer<typeof SkillMixSchema>;
export type ListeningOption = z.infer<typeof ListeningOptionSchema>;
export type ReadingArtifact = z.infer<typeof ReadingArtifactSchema>;
export type PackBeat = z.infer<typeof PackBeatSchema>;
export type PackCharacter = z.infer<typeof PackCharacterSchema>;
export type PracticePackData = z.infer<typeof PracticePackDataSchema>;
