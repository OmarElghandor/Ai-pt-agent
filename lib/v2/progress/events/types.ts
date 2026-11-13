import { z } from 'zod';

const resumeSchema = z.object({
  step_id: z.string().min(1),
  page_index: z.number().int().nonnegative().optional(),
  item_index: z.number().int().nonnegative().optional(),
});

const base = z.object({
  event_id: z.string().uuid(),
  target_lang: z.string().min(1).default('pt-PT'),
});

export const ProgressEventSchema = z.discriminatedUnion('kind', [
  base.extend({
    kind: z.literal('lesson_opened'),
    day: z.number().int().positive(),
    lesson_version: z.number().int().positive().optional(),
    steps: z
      .array(
        z.object({
          id: z.string().min(1),
          present: z.boolean(),
        }),
      )
      .optional(),
    day_questions_total: z.number().int().nonnegative().optional(),
  }),
  base.extend({
    kind: z.literal('step_done'),
    day: z.number().int().positive(),
    step_id: z.string().min(1),
    resume: resumeSchema.optional(),
  }),
  base.extend({
    kind: z.literal('day_question_answered'),
    day: z.number().int().positive(),
    skill: z.string().optional(),
    first_try_correct: z.boolean().optional(),
    answered_count: z.number().int().positive().optional(),
    total: z.number().int().positive().optional(),
  }),
  base.extend({
    kind: z.literal('lesson_finished'),
    day: z.number().int().positive(),
  }),
  base.extend({
    kind: z.literal('card_rated'),
    item_id: z.string().min(1),
    rating: z.enum(['again', 'hard', 'easy', 'know']),
    hint: z.boolean().optional(),
    local_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  base.extend({
    kind: z.literal('deck_opened'),
    local_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    cards: z
      .array(
        z.object({
          item_id: z.string().min(1),
          slot: z.enum(['recent', 'weak', 'older']),
        }),
      )
      .optional(),
  }),
  base.extend({
    kind: z.literal('problem_session_finished'),
    problem: z.string().min(1),
    questions_answered: z.number().int().nonnegative().default(0),
  }),
  base.extend({
    kind: z.literal('convo_finished'),
    day: z.number().int().positive().optional(),
    said: z.number().int().nonnegative().default(0),
    understood: z.number().int().nonnegative().default(0),
    learner_turns: z.number().int().nonnegative().default(0),
  }),
  base.extend({
    kind: z.literal('active_minutes'),
    minutes: z.number().nonnegative(),
    day: z.number().int().positive().optional(),
  }),
]);

export type ProgressEvent = z.infer<typeof ProgressEventSchema>;

/** Cap active minutes credited per single event (open tab guard). */
export const MAX_ACTIVE_MINUTES_PER_EVENT = 5;
