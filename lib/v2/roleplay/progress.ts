import { randomUUID } from 'node:crypto';
import type { ConvoAnswerPayload } from '@/lib/v2/answers/payload';
import type { ConvoProgressWriter } from '@/lib/v2/convo/progress/mirror';
import type { RoleplaySituation } from './types';

/**
 * Credit situation core items through the answers progress writer.
 * Assisted steps write rung `assisted`; alone writes `said`.
 */
export async function creditRoleplayItems(opts: {
  situation: RoleplaySituation;
  sessionId: string;
  day: number;
  assisted: boolean;
  write: ConvoProgressWriter;
  itemIds?: string[];
}): Promise<number> {
  const ids =
    opts.itemIds && opts.itemIds.length > 0
      ? opts.itemIds
      : opts.situation.item_ids;
  let writes = 0;
  const rung = opts.assisted ? 'assisted' : 'said';
  for (const item_id of ids) {
    const payload: ConvoAnswerPayload = {
      kind: 'convo',
      answer_id: randomUUID(),
      day: opts.day,
      item_id,
      rung,
      session_id: opts.sessionId,
    };
    await opts.write(payload);
    writes += 1;
  }
  return writes;
}
