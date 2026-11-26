import { z } from 'zod';

export const GeneratedLineSchema = z.object({
  tl: z.string().min(1),
  ar: z.string().min(1),
  pos: z.enum(['noun', 'verb', 'adjective', 'phrase']),
  concept_en: z.string().optional(),
  icon_spec: z.string().optional(),
  region_hint: z.string().optional(),
  verb_lemma: z.string().optional(),
  /** Model may send this; code ignores and recomputes from the table. */
  conjugations: z.unknown().optional(),
});

export const GenerateClipOutputSchema = z.object({
  title_tl: z.string().min(1),
  title_ar: z.string().min(1),
  note: z.string().optional(),
  /** English subject for the Lisbon watercolour main picture. */
  image_spec: z.string().min(1),
  rule_card: z
    .object({
      pattern_tl: z.string(),
      pattern_ar: z.string().optional(),
      ending_table: z
        .array(
          z.object({
            label: z.string(),
            from: z.string(),
            to: z.string(),
          }),
        )
        .optional(),
    })
    .optional(),
  lines: z.array(GeneratedLineSchema).min(1),
});

export const TopUpClipOutputSchema = z.object({
  lines: z.array(GeneratedLineSchema).min(1),
});

export type GeneratedLine = z.infer<typeof GeneratedLineSchema>;
export type GenerateClipOutput = z.infer<typeof GenerateClipOutputSchema>;
