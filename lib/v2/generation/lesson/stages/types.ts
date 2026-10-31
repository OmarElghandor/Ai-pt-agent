import { z } from 'zod';
import { ItemSchema } from '@/lib/v2/content/items';
import { PresetSchema, ModeSchema } from '@/lib/v2/content/page';
import type { CallTiming } from '../cost';
import type { LessonPack, Question } from '@/lib/v2/content/lesson';
import type { Page } from '@/lib/v2/content/page';
import type { Item } from '@/lib/v2/content/items';

export const StageStatusSchema = z.enum(['pending', 'done', 'failed']);
export type StageStatus = z.infer<typeof StageStatusSchema>;

export const OutlinePagePlanSchema = z.object({
  index: z.number().int().nonnegative(),
  page_id: z.string().min(1),
  preset: PresetSchema,
  mode: ModeSchema,
  /** Intro (page 0) or test replay pointer — no introduces; skipped by LLM page jobs. */
  role: z.enum(['intro', 'test']).optional(),
  title: z.union([z.string().min(1), z.array(z.unknown())]).transform((t) =>
    typeof t === 'string' ? t : JSON.stringify(t).slice(0, 80),
  ),
  purpose: z.string().min(1),
  introduces: z.array(z.string()).default([]),
  assumes: z.array(z.string()).default([]),
  handoff: z.string().default(''),
});

export type OutlinePagePlan = z.infer<typeof OutlinePagePlanSchema>;

/** Lenient item shape for outline — strict ItemSchema applied after normalize. */
const OutlineItemSchema = z
  .object({
    type: z.string(),
    id: z.string(),
  })
  .passthrough();

export const OutlineResultSchema = z.object({
  items: z.array(OutlineItemSchema).min(1),
  pages: z.array(OutlinePagePlanSchema).min(1),
  lesson: z
    .object({
      id: z.string().optional(),
      target_lang: z.string().optional(),
      day: z.number().optional(),
      phase: z.number().optional(),
      week: z.number().optional(),
      kind: z.enum(['lesson', 'story', 'review']).optional(),
      story_id: z.string().optional(),
      situation: z
        .object({
          tl: z.string(),
          eg: z.string(),
        })
        .optional(),
      can_do: z
        .array(
          z.object({
            eg: z.string(),
            proves: z.array(z.string()).optional(),
          }),
        )
        .optional(),
    })
    .passthrough()
    .optional(),
});

export type OutlineResultRaw = z.infer<typeof OutlineResultSchema>;

export type OutlineResult = {
  items: Item[];
  pages: OutlinePagePlan[];
  lesson?: OutlineResultRaw['lesson'];
};

/** Coerce outline items through ItemSchema; repair unusable ones into stubs. */
export function normalizeOutlineItems(raw: OutlineResultRaw['items']): Item[] {
  const out: Item[] = [];
  for (const item of raw) {
    const fixed = fixPatternSlots(item);
    const parsed = ItemSchema.safeParse(fixed);
    if (parsed.success) {
      out.push(parsed.data);
      continue;
    }
    if (item.type === 'word' || item.type === 'phrase' || item.type === 'sentence') {
      const minimal = {
        type: item.type,
        id: item.id,
        tl:
          typeof (fixed as { tl?: unknown }).tl === 'string'
            ? (fixed as { tl: string }).tl
            : item.id,
        ar:
          typeof (fixed as { ar?: unknown }).ar === 'string'
            ? (fixed as { ar: string }).ar
            : item.id,
      };
      const again = ItemSchema.safeParse(minimal);
      if (again.success) {
        out.push(again.data);
        continue;
      }
    }
    if (item.type === 'pattern') {
      const stub = ItemSchema.safeParse({
        type: 'pattern',
        id: item.id,
        slots: [{ tl: '…' }, { name_eg: '…' }],
      });
      if (stub.success) {
        out.push(stub.data);
        continue;
      }
    }
    if (item.type === 'form') {
      // forms belong in conjugation table — skip LLM form items
      continue;
    }
    // Unknown type: keep as phrase stub so introduces refs stay valid
    const stub = ItemSchema.safeParse({
      type: 'phrase',
      id: item.id,
      tl: item.id,
      ar: item.id,
    });
    if (stub.success) out.push(stub.data);
  }
  return out;
}

function fixPatternSlots(item: Record<string, unknown>): Record<string, unknown> {
  if (item.type !== 'pattern' || !Array.isArray(item.slots)) return item;
  const slots = item.slots.map((slot) => {
    if (!slot || typeof slot !== 'object') return { tl: String(slot ?? '') };
    const s = slot as Record<string, unknown>;
    if (typeof s.tl === 'string') return { tl: s.tl };
    if (typeof s.name_eg === 'string') {
      return { name_eg: s.name_eg, group: s.group };
    }
    if (typeof s.text === 'string') return { tl: s.text };
    if (typeof s.label === 'string') return { name_eg: s.label };
    return { tl: JSON.stringify(s).slice(0, 40) };
  });
  return { ...item, slots };
}

export const PageStageStatusSchema = z.object({
  index: z.number().int().nonnegative(),
  page_id: z.string(),
  status: StageStatusSchema,
  attempts: z.number().int().optional(),
  last_error: z.string().optional(),
});

export type PageStageStatus = z.infer<typeof PageStageStatusSchema>;

export const GenerationStagesSchema = z.object({
  outline: StageStatusSchema,
  pages: z.array(PageStageStatusSchema),
  questions: StageStatusSchema,
  continuity: StageStatusSchema,
  text_ready: z.boolean(),
});

export type GenerationStages = z.infer<typeof GenerationStagesSchema>;

export type PartialLessonData = {
  lesson?: LessonPack['lesson'];
  items?: Item[];
  pages?: (Page | null)[];
  questions?: Question[];
  micro?: LessonPack['micro'];
  speak_prompts?: LessonPack['speak_prompts'];
  outline?: OutlineResult;
};

export type StageRunContext = {
  day: number;
  targetLang: string;
  version: number;
  timings: CallTiming[];
  model: string;
};

export const PAGE_CONCURRENCY = 6;
export const MAX_TOKENS_OUTLINE = 16_000;
export const MAX_TOKENS_PAGE = 16_000;
export const MAX_TOKENS_QUESTIONS = 16_000;
export const MAX_TOKENS_CONTINUITY = 4_000;

export function emptyStages(pageCount = 0): GenerationStages {
  return {
    outline: 'pending',
    pages: Array.from({ length: pageCount }, (_, i) => ({
      index: i,
      page_id: `p${i + 1}`,
      status: 'pending' as const,
    })),
    questions: 'pending',
    continuity: 'pending',
    text_ready: false,
  };
}
