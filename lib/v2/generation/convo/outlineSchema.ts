import { z } from 'zod';
import {
  ConvoGroupSchema,
  ConvoRecapSchema,
  ConvoSceneSchema,
  ConvoVisualSchema,
} from '@/lib/v2/convo/pack/schema';

/**
 * LLM + code output for convo_outline (09 §4.1 step 1).
 * Full item banks come from convo_items (T5.2).
 */
export const ConvoOutlineToolSchema = z.object({
  scene: ConvoSceneSchema,
  visual: ConvoVisualSchema,
  groups: z.array(ConvoGroupSchema).min(1).max(4),
  recap: ConvoRecapSchema,
  /** Optional character lines; assemble may rewrite. */
  opening_tl: z.string().min(1).optional(),
  closing_tl: z.string().min(1).optional(),
  bridge_tl: z.string().min(1).optional(),
});

export type ConvoOutline = z.infer<typeof ConvoOutlineToolSchema>;
