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

export const ModeSchema = z.enum(['guided', 'explore', 'static']);

export const CoverSchema = z.enum(['meaning', 'tl', 'endings']);

/** Code-owned: model never chooses mode. */
export function modeForPreset(
  preset: z.infer<typeof PresetSchema> | string,
): z.infer<typeof ModeSchema> {
  switch (preset) {
    case 'compare':
    case 'pattern':
    case 'story':
      return 'guided';
    case 'conjugation':
      return 'explore';
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

export const PageSchema = z.object({
  id: z.string(),
  preset: PresetSchema,
  mode: ModeSchema,
  tool_id: z.string().optional(),
  pill: z.string().optional(),
  title: RtSchema,
  subtitle: RtSchema.optional(),
  blocks: z.array(BlockSchema).min(1),
  steps: z.array(StepSchema).optional(),
  controls: z.array(ControlSchema).optional(),
  locked_until: z.array(LockedUntilSchema).optional(),
  cover: CoverSchema.optional(),
  quiz: z.array(z.string()).optional(),
  library: z.boolean().optional(),
  preset_reason: z.string().optional(),
});

export type Page = z.infer<typeof PageSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Control = z.infer<typeof ControlSchema>;
export type Cover = z.infer<typeof CoverSchema>;
export type Preset = z.infer<typeof PresetSchema>;
export type Mode = z.infer<typeof ModeSchema>;
