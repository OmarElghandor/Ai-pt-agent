import { z } from 'zod';
import { RtGroupSchema, RtSchema } from './rt';

const MediaSchema = z
  .object({
    icon: z.string().optional(),
    image: z.string().optional(),
  })
  .passthrough();

const RefOrRtCellSchema = z.union([
  z.object({ ref: z.string() }),
  RtSchema,
]);

const HeadingBlockSchema = z.object({
  id: z.string(),
  type: z.literal('heading'),
  group: RtGroupSchema.optional(),
  text: RtSchema,
});

const CardsBlockSchema = z.object({
  id: z.string(),
  type: z.literal('cards'),
  group: RtGroupSchema.optional(),
  items: z.array(z.string()),
  cols: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
  numbered: z.boolean().optional(),
});

const TableBlockSchema = z.object({
  id: z.string(),
  type: z.literal('table'),
  group: RtGroupSchema.optional(),
  split_endings: z.boolean().optional(),
  cols: z.array(
    z.object({
      label: RtSchema,
      group: RtGroupSchema.optional(),
    }),
  ),
  rows: z.array(
    z.object({
      label: RtSchema,
      media: MediaSchema.optional(),
    }),
  ),
  cells: z.array(z.array(RefOrRtCellSchema)),
});

const CompareEntrySchema = z.object({
  label: RtSchema,
  ref: z.string(),
  media: MediaSchema.optional(),
});

const CompareBlockSchema = z.object({
  id: z.string(),
  type: z.literal('compare'),
  group: RtGroupSchema.optional(),
  columns: z.array(
    z.object({
      head: RtSchema,
      sub: RtSchema.optional(),
      group: RtGroupSchema,
      entries: z.array(CompareEntrySchema),
    }),
  ),
});

const VsPairsBlockSchema = z.object({
  id: z.string(),
  type: z.literal('vs_pairs'),
  group: RtGroupSchema.optional(),
  pairs: z.array(
    z.object({
      left: z.string(),
      right: z.string(),
      note: RtSchema.optional(),
    }),
  ),
});

const FormulaBlockSchema = z.object({
  id: z.string(),
  type: z.literal('formula'),
  group: RtGroupSchema.optional(),
  pattern: z.string(),
  examples: z.array(z.string()).optional(),
});

const ExamplesBlockSchema = z.object({
  id: z.string(),
  type: z.literal('examples'),
  group: RtGroupSchema.optional(),
  items: z.array(
    z.object({
      ref: z.string(),
      media: MediaSchema.optional(),
      group: RtGroupSchema.optional(),
    }),
  ),
});

const TipBlockSchema = z.object({
  id: z.string(),
  type: z.literal('tip'),
  group: RtGroupSchema.optional(),
  kind: z.enum(['rule', 'culture', 'warning']),
  title: RtSchema,
  body: RtSchema,
});

const RulesListBlockSchema = z.object({
  id: z.string(),
  type: z.literal('rules_list'),
  group: RtGroupSchema.optional(),
  items: z.array(RtSchema),
});

const DialogueBlockSchema = z.object({
  id: z.string(),
  type: z.literal('dialogue'),
  group: RtGroupSchema.optional(),
  lines: z.array(z.string()),
});

const SceneBlockSchema = z.object({
  id: z.string(),
  type: z.literal('scene'),
  group: RtGroupSchema.optional(),
  image: z.string(),
  hotspots: z.array(
    z.object({
      x: z.number(),
      y: z.number(),
      ref: z.string(),
    }),
  ),
});

const PanelBlockSchema = z.object({
  id: z.string(),
  type: z.literal('panel'),
  group: RtGroupSchema.optional(),
  image: z.string(),
  lines: z.array(z.string()),
});

const TimelineBlockSchema = z.object({
  id: z.string(),
  type: z.literal('timeline'),
  group: RtGroupSchema.optional(),
  points: z.array(
    z.object({
      at: z.enum(['past', 'now', 'future']),
      ref: z.string(),
      label: RtSchema.optional(),
    }),
  ),
});

const PracticeBlockSchema = z.object({
  id: z.string(),
  type: z.literal('practice'),
  group: RtGroupSchema.optional(),
  questions: z.array(z.string()),
});

export const BlockSchema = z.discriminatedUnion('type', [
  HeadingBlockSchema,
  CardsBlockSchema,
  TableBlockSchema,
  CompareBlockSchema,
  VsPairsBlockSchema,
  FormulaBlockSchema,
  ExamplesBlockSchema,
  TipBlockSchema,
  RulesListBlockSchema,
  DialogueBlockSchema,
  SceneBlockSchema,
  PanelBlockSchema,
  TimelineBlockSchema,
  PracticeBlockSchema,
]);

export type Block = z.infer<typeof BlockSchema>;
