import { z } from 'zod';
import { ItemSchema } from './items';
import { PageSchema } from './page';
import { RtSchema } from './rt';

export const SkillSchema = z.enum([
  'listening',
  'reading',
  'speaking',
  'writing',
]);

const LessonMetaSchema = z.object({
  id: z.string(),
  target_lang: z.string(),
  day: z.number().int().positive(),
  phase: z.number().int().optional(),
  week: z.number().int().optional(),
  kind: z.enum(['lesson', 'story', 'review']).default('lesson'),
  situation: z
    .object({
      tl: z.string(),
      eg: z.string(),
    })
    .optional(),
  can_do: z
    .array(
      z.object({
        eg: z.string(),
        proves: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  pages: z.array(z.string()),
});

const QuestionSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    skill: SkillSchema,
    tests: z.array(z.string()).optional(),
    tool_id: z.string().optional(),
    prompt: z.unknown(),
    options: z.array(z.unknown()).optional(),
    answer: z.unknown().optional(),
    feedback_eg: RtSchema.optional(),
    why_wrong_eg: z.array(z.union([RtSchema, z.null()])).optional(),
  })
  .passthrough();

export const LessonPackSchema = z.object({
  lesson: LessonMetaSchema,
  items: z.array(ItemSchema),
  pages: z.array(PageSchema).min(1),
  questions: z.array(QuestionSchema).default([]),
});

export type LessonMeta = z.infer<typeof LessonMetaSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type LessonPack = z.infer<typeof LessonPackSchema>;
export type Skill = z.infer<typeof SkillSchema>;
