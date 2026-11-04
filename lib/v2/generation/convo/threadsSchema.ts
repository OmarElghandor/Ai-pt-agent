import { z } from 'zod';

/** Tool output for future free-topic thread generation (Batch 9 C10). */
export const ThreadGenFrameSchema = z.object({
  tl: z.string().min(1),
  eg: z.string().min(1),
  chips: z.array(z.string().min(1)).min(2),
});

export const ThreadGenAskSchema = z.object({
  tl: z.string().min(1),
  ar: z.string().min(1),
  kind: z.enum(['open', 'either_or', 'yes_no']),
  frame: ThreadGenFrameSchema,
  skip_if_negative: z.boolean().optional(),
});

export const ThreadGenThreadSchema = z.object({
  id: z.string().min(1),
  share: z.object({ tl: z.string().min(1), ar: z.string().min(1) }),
  ask: ThreadGenAskSchema,
  follow_ups: z.array(ThreadGenAskSchema).min(1),
});

export const ThreadGenTopicSchema = z.object({
  id: z.string().min(1),
  title_tl: z.string().min(1),
  title_in_sentence_tl: z.string().min(1),
  title_ar: z.string().min(1),
  character_id: z.string().min(1),
  related: z.array(z.string().min(1)).min(1),
  intro_eg: z.string().min(1),
  opening_tl: z.string().min(1),
  opening_ar: z.string().min(1),
});

export const TopicThreadsToolSchema = z.object({
  target_lang: z.string().min(1).default('pt-PT'),
  version: z.number().int().positive().default(1),
  topic: ThreadGenTopicSchema,
  threads: z.array(ThreadGenThreadSchema).length(5),
});

export type TopicThreadsToolOut = z.infer<typeof TopicThreadsToolSchema>;
