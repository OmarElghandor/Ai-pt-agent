import { z } from 'zod';

/** JSON-Schema-safe optional that also accepts null from Mongo/models. */
function nullishField<T extends z.ZodType>(schema: T) {
  return schema.nullable().optional();
}

export const StoryCastRoleSchema = z.enum([
  'learner',
  'character',
  'narrator',
]);

export const StoryCastEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: StoryCastRoleSchema,
});

export const StoryExtraSchema = z.object({
  tl: z.string().min(1),
  ar: z.string().min(1),
});

export const StoryLineOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  correct: z.boolean(),
});

export const StoryLineAudioSchema = z.object({
  normal: nullishField(z.string()),
  slow: nullishField(z.string()),
});

/** Code-owned end-of-story questions (test mode). */
export const StoryAfterQuestionKindSchema = z.enum([
  'character_asked',
  'learner_replied',
  'line_meaning',
]);

export const StoryAfterQuestionSchema = z.object({
  id: z.string().min(1),
  kind: StoryAfterQuestionKindSchema,
  /** Egyptian prompt shown to the learner. */
  prompt_eg: z.string().min(1),
  options: z.array(StoryLineOptionSchema).min(2).max(4),
  /** Line the question is about. */
  line_index: z.number().int().nonnegative(),
});

export const StoryLineSchema = z.object({
  speaker: z.string().min(1),
  tl: z.string().min(1),
  ar: nullishField(z.string()),
  ids: z.array(z.string()).nullable().optional(),
  extra: nullishField(z.array(StoryExtraSchema)),
  /** Index of the line this learner reply answers. */
  replies_to: nullishField(z.number().int().nonnegative()),
  /** Code-owned: learner on left, character on right. */
  side: nullishField(z.enum(['left', 'right', 'center'])),
  audio: nullishField(StoryLineAudioSchema),
  /** Legacy mid-story options; no longer written by enrich. */
  options: nullishField(z.array(StoryLineOptionSchema)),
});

export const StoryImageSpecSchema = z
  .object({
    type: z.enum([
      'object',
      'action',
      'emotion',
      'place',
      'scene',
      'story_panel',
    ]),
    subject: z.string(),
    characters: nullishField(z.array(z.string())),
    pose: nullishField(z.string()),
    expression: nullishField(z.string()),
    setting: nullishField(z.string()),
    framing: nullishField(z.string()),
    light: nullishField(z.string()),
    must_show: nullishField(z.union([z.string(), z.array(z.string())])),
    must_avoid: nullishField(z.union([z.string(), z.array(z.string())])),
  })
  .passthrough();

export const StorySceneSchema = z.object({
  id: z.string().min(1),
  title_eg: nullishField(z.string()),
  line_start: z.number().int().nonnegative(),
  line_end: z.number().int().nonnegative(),
  image_spec: nullishField(StoryImageSpecSchema),
});

export const StoryStatusSchema = z.enum([
  'draft',
  'ready',
  'published',
  'failed',
]);

/** Weekly story days: short reading + 3 comprehension questions. */
export const StoryReadingQuestionTypeSchema = z.enum([
  'read_meaning',
  'true_false',
]);

export const StoryReadingQuestionSchema = z.object({
  id: z.string().min(1),
  type: StoryReadingQuestionTypeSchema,
  prompt_eg: z.string().min(1),
  options: z.array(StoryLineOptionSchema).min(2).max(4),
});

export const StoryReadingSchema = z.object({
  /** 60–120 words, week items only. */
  tl: z.string().min(1),
  questions: z.array(StoryReadingQuestionSchema).min(3).max(3),
});

export const StoryDocSchema = z.object({
  id: z.string().min(1),
  day: z.number().int().positive(),
  target_lang: z.string().min(1),
  version: z.number().int().positive(),
  status: StoryStatusSchema,
  cast: z.array(StoryCastEntrySchema).min(1),
  setting: z.string().min(1),
  lines: z.array(StoryLineSchema).min(1),
  image_spec: nullishField(StoryImageSpecSchema),
  scenes: nullishField(z.array(StorySceneSchema)),
  /** Weekly story days only. */
  is_weekly: nullishField(z.boolean()),
  /** Code-owned: 3–4 questions after uninterrupted test replay. */
  after_questions: nullishField(z.array(StoryAfterQuestionSchema)),
  /** Weekly only: short reading passage + 3 questions. */
  reading: nullishField(StoryReadingSchema),
});

export type StoryCastRole = z.infer<typeof StoryCastRoleSchema>;
export type StoryCastEntry = z.infer<typeof StoryCastEntrySchema>;
export type StoryExtra = z.infer<typeof StoryExtraSchema>;
export type StoryLine = z.infer<typeof StoryLineSchema>;
export type StoryLineOption = z.infer<typeof StoryLineOptionSchema>;
export type StoryAfterQuestionKind = z.infer<typeof StoryAfterQuestionKindSchema>;
export type StoryAfterQuestion = z.infer<typeof StoryAfterQuestionSchema>;
export type StoryReadingQuestion = z.infer<typeof StoryReadingQuestionSchema>;
export type StoryReading = z.infer<typeof StoryReadingSchema>;
export type StoryScene = z.infer<typeof StorySceneSchema>;
export type StoryStatus = z.infer<typeof StoryStatusSchema>;
export type StoryDoc = z.infer<typeof StoryDocSchema>;

/** Stable story id: pt-PT.day-03 */
export function storyIdFor(day: number, targetLang = 'pt-PT'): string {
  return `${targetLang}.day-${String(day).padStart(2, '0')}`;
}

/** Drop null/undefined optionals so Mongo and callers never see null. */
export function normalizeStoryForSave(story: StoryDoc): StoryDoc {
  return {
    ...story,
    image_spec: story.image_spec ?? undefined,
    scenes: story.scenes ?? undefined,
    is_weekly: story.is_weekly ?? undefined,
    after_questions: story.after_questions?.length
      ? story.after_questions
      : undefined,
    reading: story.reading ?? undefined,
    lines: story.lines.map((line) => {
      const next: StoryLine = {
        speaker: line.speaker,
        tl: line.tl,
        ids: line.ids ?? [],
      };
      if (line.ar != null && line.ar !== '') next.ar = line.ar;
      if (line.extra?.length) next.extra = line.extra;
      if (line.replies_to != null) next.replies_to = line.replies_to;
      if (line.side != null) next.side = line.side;
      if (line.audio && (line.audio.normal || line.audio.slow)) {
        next.audio = {
          ...(line.audio.normal ? { normal: line.audio.normal } : {}),
          ...(line.audio.slow ? { slow: line.audio.slow } : {}),
        };
      }
      // Drop legacy mid-story options on save.
      return next;
    }),
  };
}

/** Parse Mongo/model payloads; coerce null optionals away. */
export function parseStoryDoc(raw: unknown): StoryDoc {
  return normalizeStoryForSave(StoryDocSchema.parse(raw));
}
