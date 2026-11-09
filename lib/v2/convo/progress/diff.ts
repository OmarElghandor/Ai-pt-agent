import { createHash } from 'node:crypto';
import type { ConvoRung } from '@/lib/v2/convo/session';

export type ConvoRungProgress = 'heard' | 'understood' | 'said' | 'assisted';

export type ConvoProgressTransition = {
  item_id: string;
  from: ConvoRung;
  to: ConvoRungProgress;
};

const MIRRORABLE = new Set<ConvoRung>([
  'heard',
  'understood',
  'said',
  'assisted',
]);

/**
 * Diff session rungs before → after a turn; emit only newly reached
 * progress rungs (09 §3).
 */
export function diffConvoRungProgress(
  before: Record<string, ConvoRung>,
  after: Record<string, ConvoRung>,
): ConvoProgressTransition[] {
  const out: ConvoProgressTransition[] = [];
  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const id of ids) {
    const from = before[id] ?? 'taught';
    const to = after[id] ?? 'taught';
    if (from === to) continue;
    if (!MIRRORABLE.has(to)) continue;
    out.push({
      item_id: id,
      from,
      to: to as ConvoRungProgress,
    });
  }
  return out;
}

/**
 * Deterministic UUID for answer_id idempotency (session × item × rung).
 */
export function convoProgressAnswerId(opts: {
  sessionId: string;
  itemId: string;
  rung: ConvoRungProgress;
  turnKey?: string;
}): string {
  const hex = createHash('sha256')
    .update(
      `${opts.sessionId}|${opts.itemId}|${opts.rung}|${opts.turnKey ?? ''}`,
    )
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
