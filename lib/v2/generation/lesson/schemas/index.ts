import type { z } from 'zod';
import { ContinuityToolSchema } from '../jobs/runContinuity';
import { CriticSchema } from '../jobs/runCritic';
import { DailyUseSchema } from '../jobs/runDailyUse';
import { LangCheckSchema } from '../jobs/runLangCheck';
import { MicroJobSchema } from '../jobs/runMicro';
import { OutlineToolSchema } from '../jobs/runOutline';
import { QuestionsSchema } from '../jobs/runQuestions';
import { StoryToolSchema } from '../jobs/runStory';
import { ItemsJobSchema } from './items';
import { PageJobSchema } from './page';

export { ItemsJobSchema, GenItemSchema, clozeAppearsInTl } from './items';
export type { GenItem } from './items';
export { PageJobSchema, GenPageSchema } from './page';

/** Per-job tool schemas (zod → JSON Schema via zodToolSchema). No passthrough. */
export const JOB_SCHEMAS = {
  items: ItemsJobSchema,
  story: StoryToolSchema,
  outline: OutlineToolSchema,
  page: PageJobSchema,
  critic: CriticSchema,
  questions: QuestionsSchema,
  micro: MicroJobSchema,
  daily_use: DailyUseSchema,
  continuity: ContinuityToolSchema,
  lang_check: LangCheckSchema,
} as const satisfies Record<string, z.ZodType>;

export type JobSchemaKind = keyof typeof JOB_SCHEMAS;
