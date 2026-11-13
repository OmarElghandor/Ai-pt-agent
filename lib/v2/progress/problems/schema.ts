import { z } from 'zod';

export const ProblemTopSchema = z.enum([
  'grammar',
  'vocabulary',
  'spelling',
  'pronunciation',
]);

export const ProblemSchema = z.object({
  id: z
    .string()
    .regex(
      /^(grammar|vocabulary|spelling|pronunciation)\.[a-z0-9_]+$/,
      'id must be top.slug',
    ),
  top: ProblemTopSchema,
  title_tl: z.string().min(1),
  title_ar: z.string().min(1),
  explain_eg: z.string().min(1),
  taught_on: z.object({
    days: z.array(z.number().int().positive()).min(1),
    library_page: z.string().optional(),
  }),
  patterns: z.array(z.string().min(1)).default([]),
  available_from: z.number().int().positive(),
});

export const ProblemsFileSchema = z.object({
  version: z.number().int().positive(),
  target_lang: z.string().min(1),
  problems: z.array(ProblemSchema),
});

export type Problem = z.infer<typeof ProblemSchema>;
export type ProblemsFile = z.infer<typeof ProblemsFileSchema>;

/** Non-problem classifier outcomes — never open a weak spot. */
export const NON_PROBLEM_IDS = new Set(['slip', 'unsure', 'other']);
