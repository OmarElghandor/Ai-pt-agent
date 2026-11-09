import { z } from 'zod';

export const TopicAnglesToolSchema = z.object({
  angles: z
    .array(
      z.object({
        id: z.string().min(1),
        tl: z.string().min(1),
        item_hints: z.array(z.string()).default([]),
      }),
    )
    .min(8)
    .max(12),
});

export type TopicAnglesToolOut = z.infer<typeof TopicAnglesToolSchema>;
