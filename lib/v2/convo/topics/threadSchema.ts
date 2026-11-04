import { z } from 'zod';

export const ThreadFrameSchema = z.object({
  tl: z.string().min(1),
  eg: z.string().min(1),
  chips: z.array(z.string().min(1)).min(2),
});

export const ThreadShareSchema = z.object({
  tl: z.string().min(1),
  ar: z.string().min(1),
});

export const ThreadLineKindSchema = z.enum(['open', 'either_or', 'yes_no']);

export const ThreadAskSchema = z.object({
  tl: z.string().min(1),
  ar: z.string().min(1),
  kind: ThreadLineKindSchema,
  frame: ThreadFrameSchema,
});

export const ThreadFollowUpSchema = ThreadAskSchema.extend({
  skip_if_negative: z.boolean().optional(),
});

export const ThreadSchema = z.object({
  id: z.string().min(1),
  share: ThreadShareSchema,
  ask: ThreadAskSchema,
  follow_ups: z.array(ThreadFollowUpSchema).min(1),
});

export const ThreadTopicMetaSchema = z.object({
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

export const ThreadTopicFileSchema = z.object({
  target_lang: z.string().min(1),
  version: z.number().int().positive(),
  topic: ThreadTopicMetaSchema,
  threads: z.array(ThreadSchema).min(1),
});
