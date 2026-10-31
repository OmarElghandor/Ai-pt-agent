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
  /** Points at v2_stories; lines live on the story document. */
  story_id: z.string().optional(),
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
    /** 0-based page index this question belongs to (staged generation). */
    page_index: z.number().int().nonnegative().optional(),
    tests: z.array(z.string()).optional(),
    tool_id: z.string().optional(),
    prompt: z.unknown(),
    options: z.array(z.unknown()).optional(),
    answer: z.unknown().optional(),
    feedback_eg: RtSchema.optional(),
    why_wrong_eg: z.array(z.union([RtSchema, z.null()])).optional(),
  })
  .passthrough();

export const MicroNoticeOptionSchema = z.object({
  text: z.string(),
  correct: z.boolean(),
  wrong: z.boolean().optional(),
});

/** Self-contained drill quiz (not a ref into the day's questions bank). */
export const MicroDrillSchema = z
  .object({
    id: z.string().optional(),
    prompt: z.union([z.string(), z.unknown()]),
    options: z.array(MicroNoticeOptionSchema).min(2),
    answer: z.unknown().optional(),
  })
  .passthrough();

export const MicroSchema = z.object({
  morning: z.object({
    phrase: z.string(),
    mission_eg: z.string(),
  }),
  tool: z.object({
    tool_id: z.string(),
    step: z.number().int().positive(),
    of: z.number().int().positive(),
    builds_on_eg: z.string(),
    examples: z.array(z.string()).min(1),
    notice: z.object({
      question_eg: z.string(),
      options: z.array(MicroNoticeOptionSchema).min(3).max(3),
    }),
    rule_eg: z.string(),
    /** Inline drills (generation writes 2 objects; older packs may store question ids). */
    drills: z.array(z.union([z.string(), MicroDrillSchema])).min(1),
  }),
  evening: z.object({
    teaser_eg: z.string(),
  }),
});

export const SpeakPromptSchema = z.object({
  prompt_eg: z.string(),
  answer_tl: z.string(),
  ids: z.array(z.string()).min(1),
});

export const LessonPackSchema = z.object({
  lesson: LessonMetaSchema,
  items: z.array(ItemSchema),
  pages: z.array(PageSchema).min(1),
  questions: z.array(QuestionSchema).default([]),
  /** Day micro units from generation (optional on older packs). */
  micro: MicroSchema.optional(),
  /** Speak prompts from generation (optional on older packs). */
  speak_prompts: z.array(SpeakPromptSchema).min(3).max(4).optional(),
});

export type LessonMeta = z.infer<typeof LessonMetaSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type LessonPack = z.infer<typeof LessonPackSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type Micro = z.infer<typeof MicroSchema>;
export type SpeakPrompt = z.infer<typeof SpeakPromptSchema>;
