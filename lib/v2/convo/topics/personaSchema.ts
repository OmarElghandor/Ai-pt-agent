import { z } from 'zod';

export const PersonaExampleSchema = z.object({
  learner: z.string().min(1),
  reply_tl: z.string().min(1),
  reply_ar: z.string().min(1),
});

export const PersonaSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().positive(),
  address: z.literal('tu'),
  address_examples: z.string().min(1),
  who: z.string().min(1),
  facts_tl: z.array(z.string().min(1)).min(1),
  style: z.string().min(1),
  examples: z.array(PersonaExampleSchema).min(1),
});

export const PersonasFileSchema = z.object({
  target_lang: z.string().min(1),
  note: z.string().optional(),
  personas: z.record(z.string(), PersonaSchema),
});
