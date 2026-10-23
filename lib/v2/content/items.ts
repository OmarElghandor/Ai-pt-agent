import { z } from 'zod';
import { RtGroupSchema } from './rt';

const MarkSchema = z.object({
  text: z.string(),
  group: RtGroupSchema,
});

const MediaSchema = z
  .object({
    icon: z.string().optional(),
    image: z.string().optional(),
    audio: z.string().optional(),
  })
  .passthrough();

export const TenseSchema = z.enum([
  'inf',
  'pres',
  'pret',
  'imperf',
  'fut',
  'cond',
  'imp',
]);

export const PersonSchema = z.enum(['eu', 'tu', 'ele', 'nos', 'eles']);

const WordItemSchema = z.object({
  type: z.literal('word'),
  id: z.string(),
  tl: z.string(),
  lemma: z.string().optional(),
  gender: z.enum(['m', 'f', 'n']).optional(),
  plural: z.string().optional(),
  ar: z.string(),
  ar_f: z.string().optional(),
  say: z.string().optional(),
  ipa: z.string().optional(),
  pos: z.string().optional(),
  rank: z.number().optional(),
  media: MediaSchema.optional(),
  example: z.string().optional(),
});

const PhraseItemSchema = z.object({
  type: z.literal('phrase'),
  id: z.string(),
  tl: z.string(),
  tl_f: z.string().optional(),
  ar: z.string(),
  ar_f: z.string().optional(),
  say: z.string().optional(),
  ipa: z.string().optional(),
  marks: z.array(MarkSchema).optional(),
  media: MediaSchema.optional(),
  context_eg: z.string().optional(),
  cloze: z.string().optional(),
  audio: z.string().optional(),
});

const SentenceItemSchema = z.object({
  type: z.literal('sentence'),
  id: z.string(),
  tl: z.string(),
  ar: z.string(),
  say: z.string().optional(),
  marks: z.array(MarkSchema).optional(),
  speaker: z.string().optional(),
  gloss: z.unknown().optional(),
});

const FormItemSchema = z.object({
  type: z.literal('form'),
  id: z.string(),
  lemma: z.string(),
  tense: TenseSchema,
  person: PersonSchema,
  tl: z.string(),
  stem: z.string().optional(),
  ending: z.string().optional(),
  irregular: z.boolean().optional(),
  say: z.string().optional(),
});

const PatternSlotSchema = z.union([
  z.object({ tl: z.string() }),
  z.object({
    name_eg: z.string(),
    group: RtGroupSchema.optional(),
  }),
]);

const PatternItemSchema = z.object({
  type: z.literal('pattern'),
  id: z.string(),
  slots: z.array(PatternSlotSchema),
  examples: z.array(z.string()).optional(),
});

export const ItemSchema = z.discriminatedUnion('type', [
  WordItemSchema,
  PhraseItemSchema,
  SentenceItemSchema,
  FormItemSchema,
  PatternItemSchema,
]);

export type Item = z.infer<typeof ItemSchema>;
export type Tense = z.infer<typeof TenseSchema>;
export type Person = z.infer<typeof PersonSchema>;
