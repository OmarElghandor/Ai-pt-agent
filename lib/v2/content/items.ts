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

/** Page index (0-based) where this item first appears — set by outline assembly. */
const IntroducedOnPage = z.number().int().nonnegative().optional();

function idPrefixed(prefix: string) {
  return z
    .string()
    .min(1)
    .refine((id) => id.startsWith(`${prefix}.`), {
      message: `id must start with ${prefix}.`,
    });
}

/** word.* or verb lemma card (verb.falar) — not a conjugated form id. */
const WORD_OR_VERB_LEMMA_ID = z
  .string()
  .min(1)
  .refine(
    (id) =>
      id.startsWith('word.') ||
      (/^verb\.[a-z_]+$/i.test(id) && !id.includes(':')),
    { message: 'id must be word.* or verb.<lemma> (no tense:person)' },
  );

const ExtraFlag = z.boolean().optional();

/**
 * Flashcard eligibility. Explicit false for set items, recycle copies, etc.
 * Omitted → inferred by isFlashcardItem (with NO_CARD_LEMMAS fallback).
 */
const HasCardFlag = z.boolean().optional();

/** Derived pattern examples use pattern.<x>.ex.<n>; other phrases keep phrase.*. */
const PhraseOrPatternExId = z
  .string()
  .min(1)
  .refine(
    (id) =>
      id.startsWith('phrase.') || /^pattern\..+\.ex\.\d+$/.test(id),
    { message: 'id must start with phrase. or be pattern.<x>.ex.<n>' },
  );

const WordItemSchema = z.object({
  type: z.literal('word'),
  id: WORD_OR_VERB_LEMMA_ID,
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
  /** Optional: item beyond the day's core list (max 2 per day). */
  extra: ExtraFlag,
  has_card: HasCardFlag,
  introduced_on_page: IntroducedOnPage,
});

const PhraseItemSchema = z.object({
  type: z.literal('phrase'),
  id: PhraseOrPatternExId,
  tl: z.string(),
  tl_f: z.string().optional(),
  ar: z.string(),
  ar_f: z.string().optional(),
  say: z.string().optional(),
  ipa: z.string().optional(),
  marks: z.array(MarkSchema).optional(),
  media: MediaSchema.optional(),
  /** When / where you say it — Egyptian. Required for every phrase. */
  context_eg: z.string().min(1),
  /** One key word from tl to hide in cloze practice. */
  cloze: z.string().min(1),
  audio: z.string().optional(),
  /** Learner says it vs hears it (barista/clerk). Default said. */
  role: z.enum(['said', 'heard']).optional(),
  /** Said reply that answers this heard phrase (or heard id this said replies to). */
  replies_to: z.string().optional(),
  /**
   * Code-built pattern example — usable in questions/formula, not flashcards/SRS.
   * Does not count toward the day's extra-item cap.
   */
  derived: z.boolean().optional(),
  extra: ExtraFlag,
  has_card: HasCardFlag,
  introduced_on_page: IntroducedOnPage,
});

const SentenceItemSchema = z.object({
  type: z.literal('sentence'),
  id: idPrefixed('sentence'),
  tl: z.string(),
  ar: z.string(),
  say: z.string().optional(),
  marks: z.array(MarkSchema).optional(),
  speaker: z.string().optional(),
  gloss: z.unknown().optional(),
  extra: ExtraFlag,
  has_card: HasCardFlag,
  introduced_on_page: IntroducedOnPage,
});

const FormItemSchema = z.object({
  type: z.literal('form'),
  id: z.string().min(1),
  lemma: z.string(),
  tense: TenseSchema,
  person: PersonSchema,
  tl: z.string(),
  stem: z.string().optional(),
  ending: z.string().optional(),
  irregular: z.boolean().optional(),
  say: z.string().optional(),
  extra: ExtraFlag,
  has_card: HasCardFlag,
  introduced_on_page: IntroducedOnPage,
});

export const PatternSlotKindSchema = z.enum([
  'word',
  'article_um_uma',
  'article_o_a',
]);

/** Literal slot or typed hole (fills filled by code from today's words). */
export const PatternSlotSchema = z.union([
  z.object({ tl: z.string().min(1) }),
  z.object({
    name_eg: z.string().min(1),
    group: RtGroupSchema.optional(),
    kind: PatternSlotKindSchema.optional().default('word'),
    /** Word item ids that can fill this hole — code-owned for kind=word. */
    fills: z.array(z.string().min(1)).optional(),
  }),
]);

const PatternItemSchema = z.object({
  type: z.literal('pattern'),
  id: z
    .string()
    .min(1)
    .refine(
      (id) => id.startsWith('pattern.') && !/\.ex\.\d+$/.test(id),
      { message: 'pattern id must start with pattern. and not be an .ex.N example' },
    ),
  slots: z.array(PatternSlotSchema).min(1),
  /** Derived example item ids (pattern.<x>.ex.<n>) or phrase ids. */
  examples: z.array(z.string().min(1)).min(1),
  extra: ExtraFlag,
  /** Patterns never get flashcards. */
  has_card: HasCardFlag,
  introduced_on_page: IntroducedOnPage,
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
export type PatternSlot = z.infer<typeof PatternSlotSchema>;
