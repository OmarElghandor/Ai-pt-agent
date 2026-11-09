import { z } from 'zod';
import { ConvoItemBankSchema } from '@/lib/v2/convo/pack/schema';

/** One group's item banks from convo_items. */
export const ConvoItemsToolSchema = z.object({
  group_id: z.string().min(1),
  items: z.record(z.string().min(1), ConvoItemBankSchema),
});

export type ConvoItemsResult = z.infer<typeof ConvoItemsToolSchema>;
