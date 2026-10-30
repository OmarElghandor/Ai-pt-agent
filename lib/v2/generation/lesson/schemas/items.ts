import { z } from 'zod';
import { RtGroupSchema } from '@/lib/v2/content/rt';

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

/** Accent-insensitive: cloze must be one token that appears inside tl. */
export function clozeAppearsInTl(tl: string, cloze: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
  const t = norm(tl);
  const raw = cloze.trim();
  const c = norm(raw);
  if (!c || /\s/.test(raw)) return false;
  return t.includes(c);
}

function idPrefixed(prefix: string) {
  return z
    .string()
    .min(1)
    .refine((id) => id.startsWith(`${prefix}.`), {
      message: `id must start with ${prefix}.`,
    });
}

const ExtraFlag = z.boolean().optional();

/** Generation word: gender required; no say (code fills pronunciation). */
const GenWordSchema = z
  .object({
    type: z.literal('word'),
    id: idPrefixed('word'),
    tl: z.string().min(1),
    lemma: z.string().optional(),
    gender: z.enum(['m', 'f', 'n']),
    /** Legacy; prefer plural_tl. */
    plural: z.string().optional(),
    /** Plural form in the target language (optional; filled in later generations). */
    plural_tl: z.string().optional(),
    ar: z.string().min(1),
    ar_f: z.string().optional(),
    ipa: z.string().optional(),
    pos: z.string().optional(),
    rank: z.number().optional(),
    media: MediaSchema.optional(),
    example: z.string().optional(),
    extra: ExtraFlag,
  })
  .strict();

/** Generation phrase: context_eg + cloze required; no say. */
const GenPhraseSchema = z
  .object({
    type: z.literal('phrase'),
    id: idPrefixed('phrase'),
    tl: z.string().min(1),
    tl_f: z.string().optional(),
    ar: z.string().min(1),
    ar_f: z.string().optional(),
    ipa: z.string().optional(),
    marks: z.array(MarkSchema).optional(),
    media: MediaSchema.optional(),
    context_eg: z.string().min(1),
    cloze: z.string().min(1),
    audio: z.string().optional(),
    role: z.enum(['said', 'heard']).optional(),
    replies_to: z.string().optional(),
    derived: z.boolean().optional(),
    extra: ExtraFlag,
  })
  .strict();

const GenSentenceSchema = z
  .object({
    type: z.literal('sentence'),
    id: idPrefixed('sentence'),
    tl: z.string().min(1),
    ar: z.string().min(1),
    marks: z.array(MarkSchema).optional(),
    speaker: z.string().optional(),
    gloss: z.unknown().optional(),
    extra: ExtraFlag,
  })
  .strict();

/** Model returns fixed {tl} + typed holes; code owns fills + examples. */
const GenPatternSlotSchema = z.union([
  z.object({ tl: z.string().min(1) }),
  z.object({
    name_eg: z.string().min(1),
    group: RtGroupSchema.optional(),
    kind: z
      .enum([
        'word',
        'word_plural',
        'article_um_uma',
        'article_o_a',
        'article_os_as',
      ])
      .optional(),
    /** Ignored — code overwrites from today's words. */
    fills: z.array(z.string().min(1)).optional(),
  }),
]);

const GenPatternSchema = z
  .object({
    type: z.literal('pattern'),
    id: idPrefixed('pattern'),
    /** Template kind — code builds slots + examples from this. */
    kind: z
      .enum([
        'article_def',
        'article_indef',
        'plural_def',
        'polite_request',
      ])
      .optional(),
    /** Optional when kind is set — code overwrites from template. */
    slots: z.array(GenPatternSlotSchema).optional().default([]),
    /** Ignored — code builds pattern.<x>.ex.<n>. */
    examples: z.array(z.string().min(1)).optional().default([]),
    extra: ExtraFlag,
  })
  .strict();

/**
 * Item bank for the items job tool.
 * Discriminated by type so JSON Schema lists each branch's required fields.
 * No `form` (conjugations are table-owned). No `say` (strict + code fills it).
 * Verb lemma cards are code-injected, not written by the model.
 */
export const GenItemSchema = z.discriminatedUnion('type', [
  GenWordSchema,
  GenPhraseSchema,
  GenSentenceSchema,
  GenPatternSchema,
]);

/** Lenient parse — pattern fills/examples/cloze fixed in coerce (AUTO-FIX), not schema fail. */
export const ItemsJobSchema = z.object({
  items: z.array(GenItemSchema),
});

export type GenItem = z.infer<typeof GenItemSchema>;
