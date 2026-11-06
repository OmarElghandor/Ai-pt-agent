import { createHash } from 'node:crypto';
import { addUserCard } from '@/lib/v2/progress/cardsStore';

/** Stable synthetic item id for a free-text correction phrase. */
export function customCardItemId(tl: string, ar?: string): string {
  const h = createHash('sha1')
    .update(`${tl.trim()}\n${(ar ?? '').trim()}`)
    .digest('hex')
    .slice(0, 12);
  return `convo.fix.${h}`;
}

/**
 * Opt the learner into a synthetic phrase card (K5 «ضيفها للكروت»).
 * Card content (tl/ar) is carried by the client / summary; progress uses item_id.
 */
export async function addCustomCorrectionCard(opts: {
  userId: string;
  tl: string;
  ar?: string;
  day?: number;
}): Promise<{ item_id: string; created: boolean } | { error: string }> {
  const item_id = customCardItemId(opts.tl, opts.ar);
  const result = await addUserCard({
    user_id: opts.userId,
    item_id,
    introducedDay: opts.day ?? 1,
  });
  if ('error' in result) return { error: result.error };
  return { item_id, created: result.created };
}
