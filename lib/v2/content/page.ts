import { z } from 'zod';
import { BlockSchema } from './blocks';
import { RtSchema } from './rt';

export const PresetSchema = z.enum([
  'phrases',
  'compare',
  'conjugation',
  'pattern',
  'dictionary',
  'scene',
  'story',
]);

export const ModeSchema = z.enum(['sections', 'guided', 'explore', 'static']);

export const CoverSchema = z.enum(['meaning', 'tl', 'endings']);

/** Code-owned: model never chooses mode. */
export function modeForPreset(
  preset: z.infer<typeof PresetSchema> | string,
): z.infer<typeof ModeSchema> {
  switch (preset) {
    case 'compare':
    case 'pattern':
    case 'conjugation':
      return 'sections';
    case 'story':
    case 'phrases':
    case 'dictionary':
    case 'scene':
    default:
      return 'static';
  }
}

const AskOptionSchema = z.object({
  label: RtSchema,
  correct: z.boolean(),
  /** Intentionally wrong distractor / hint form. */
  wrong: z.boolean().optional(),
});

const AskSchema = z.object({
  question: RtSchema,
  options: z.array(AskOptionSchema).min(2),
  why: RtSchema.optional(),
  hint: RtSchema.optional(),
});

const RevealStepSchema = z.object({
  kind: z.literal('reveal'),
  target: z.string(),
  tip: RtSchema,
  chapter: z.string().optional(),
});

const AskStepSchema = z.object({
  kind: z.literal('ask'),
  target: z.string(),
  ask: AskSchema,
  chapter: z.string().optional(),
});

export const StepSchema = z.discriminatedUnion('kind', [
  RevealStepSchema,
  AskStepSchema,
]);

const RevealAxisControlSchema = z.object({
  id: z.string(),
  type: z.literal('reveal_axis'),
  target: z.string(),
  axis: z.enum(['rows', 'cols']),
  tips: z.array(RtSchema),
});

const SwapControlSchema = z.object({
  id: z.string(),
  type: z.literal('swap'),
  target: z.string(),
  options: z.array(z.string()),
});

const UnlockControlSchema = z.object({
  id: z.string(),
  type: z.literal('unlock'),
  target: z.string().optional(),
});

export const ControlSchema = z.discriminatedUnion('type', [
  RevealAxisControlSchema,
  SwapControlSchema,
  UnlockControlSchema,
]);

const LockedUntilSchema = z.object({
  control: z.string(),
  blocks: z.array(z.string()),
});

/** Base shape — GenPageSchema uses .omit on this (refines block .omit). */
export const PageObjectSchema = z.object({
  id: z.string(),
  preset: PresetSchema,
  mode: ModeSchema,
  /** Intro (page 0) or test replay pointer: no steps/questions. */
  role: z.enum(['intro', 'test']).optional(),
  /** Points at v2_stories; lesson does not copy story lines. */
  story_id: z.string().optional(),
  tool_id: z.string().optional(),
  pill: z.string().optional(),
  title: RtSchema,
  subtitle: RtSchema.optional(),
  blocks: z.array(BlockSchema).default([]),
  steps: z.array(StepSchema).optional(),
  controls: z.array(ControlSchema).optional(),
  locked_until: z.array(LockedUntilSchema).optional(),
  cover: CoverSchema.optional(),
  quiz: z.array(z.string()).optional(),
  library: z.boolean().optional(),
  preset_reason: z.string().optional(),
  /** Sections mode: Egyptian explanation (2–4 sentences as rt). */
  explain: RtSchema.optional(),
  /** Sections mode: 2–3 question ids from the day's bank that test the rule. */
  check: z.array(z.string()).optional(),
  /** Parsed from explain — wrong→right pairs registered as near_miss. */
  common_mistakes: z
    .array(
      z.object({
        wrong: z.string(),
        right: z.string(),
        why_eg: z.string(),
      }),
    )
    .optional(),
});

export const PageSchema = PageObjectSchema.superRefine((page, ctx) => {
  const isStoryPointer =
    Boolean(page.story_id) &&
    (page.preset === 'story' ||
      page.role === 'intro' ||
      page.role === 'test');
  if (!isStoryPointer && page.blocks.length < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['blocks'],
      message: 'page needs ≥1 block (or story_id for story pages)',
    });
  }
});

export type Page = z.infer<typeof PageSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Control = z.infer<typeof ControlSchema>;
export type Cover = z.infer<typeof CoverSchema>;
export type Preset = z.infer<typeof PresetSchema>;
export type Mode = z.infer<typeof ModeSchema>;
