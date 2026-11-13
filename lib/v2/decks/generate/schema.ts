import { z } from 'zod';

export const GeneratedWordSchema = z.object({
  tl: z.string().min(1),
  tl_f: z.string().optional(),
  pos: z.enum(['noun', 'verb', 'adjective', 'phrase']),
  gender: z.enum(['m', 'f', 'n']).optional(),
  ar: z.string().min(1),
  eg_note: z.string().optional(),
  example_tl: z.string().min(1),
  example_ar: z.string().min(1),
  /** English slug for the global image key (word.<concept_en>). */
  concept_en: z.string().min(1),
  /** Model must never send conjugations; ignored if present. */
  conjugations: z.unknown().optional(),
});

export const GenerateDeckOutputSchema = z.object({
  topic_ok: z.boolean(),
  topic_reason: z.string().optional(),
  title_tl: z.string().optional(),
  title_ar: z.string().optional(),
  tags: z.array(z.string()).max(4).optional(),
  words: z.array(GeneratedWordSchema).optional(),
});

export type GeneratedWord = z.infer<typeof GeneratedWordSchema>;
export type GenerateDeckOutput = z.infer<typeof GenerateDeckOutputSchema>;

export const TopUpOutputSchema = z.object({
  words: z.array(GeneratedWordSchema).min(1),
});
