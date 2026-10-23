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
  'free',
]);

export const ModeSchema = z.enum(['guided', 'explore', 'static']);

export const CoverSchema = z.enum(['meaning', 'tl', 'endings']);

const AskOptionSchema = z.object({
  label: RtSchema,
  correct: z.boolean(),
});

const AskSchema = z.object({
  question: RtSchema,
  options: z.array(AskOptionSchema).min(2),
  why: RtSchema.optional(),
  hint: RtSchema.optional(),
});

const StepSchema = z.object({
  target: z.string(),
  kind: z.enum(['reveal', 'ask']),
  tip: RtSchema.optional(),
  ask: AskSchema.optional(),
  chapter: z.string().optional(),
});

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
