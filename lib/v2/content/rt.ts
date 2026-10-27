import { z } from 'zod';

export const RtGroupSchema = z.enum([
  'a',
  'b',
  'c',
  'm',
  'f',
  'verb',
  'prep',
  'pron',
  'neg',
  'neutral',
]);

export const RtLangSchema = z.enum(['eg', 'ar', 'tl']);

export const RtSegmentSchema = z.object({
  text: z.string(),
  lang: RtLangSchema,
  bold: z.boolean().optional(),
  group: RtGroupSchema.optional(),
  /** Intentionally wrong form — render struck through. */
  wrong: z.boolean().optional(),
});

export const RtSchema = z.array(RtSegmentSchema).min(1);

export type RtGroup = z.infer<typeof RtGroupSchema>;
export type RtLang = z.infer<typeof RtLangSchema>;
export type RtSegment = z.infer<typeof RtSegmentSchema>;
export type Rt = z.infer<typeof RtSchema>;
