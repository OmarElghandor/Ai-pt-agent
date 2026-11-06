import type { ConvoItemBank, ConvoPackData } from '@/lib/v2/convo/pack';
import type { ConvoEventFacts } from '@/lib/v2/convo/ladder';
import { surfaceTlFor, type ConvoItemSurface } from '@/lib/v2/convo/pack';

export type PackReaction = {
  tl: string;
  ar?: string;
  /** Index into reactions_correct when used (for rotation). */
  correct_index?: number;
};

/**
 * Code-picked Learn reaction — no model call (M1).
 * correct → rotate reactions_correct; near_miss → template; mistake → consequence; else Hmm.
 */
export function pickPackReaction(opts: {
  pack: ConvoPackData;
  event: ConvoEventFacts;
  surfaces: ConvoItemSurface[];
  /** Last correct reaction tl — avoid repeating back-to-back. */
  lastCorrectTl?: string | null;
}): PackReaction {
  const { pack, event, surfaces, lastCorrectTl } = opts;
  const itemId = event.item_id;
  const bank: ConvoItemBank | undefined = itemId
    ? pack.items[itemId]
    : undefined;

  if (event.verdict === 'near_miss' || event.near_miss) {
    const template =
      bank?.reactions_near_miss?.trim() || 'Ah, {correct}! 😊';
    const correctTl = itemId
      ? surfaceTlFor(surfaces, itemId) || itemId
      : '{correct}';
    const tl = template.replace(/\{correct\}/gi, correctTl);
    return { tl };
  }

  if (event.verdict === 'correct') {
    const lines = bank?.reactions_correct ?? [];
    if (lines.length === 0) {
      return { tl: 'Isso! 😊' };
    }
    let idx = 0;
    if (lines.length > 1 && lastCorrectTl) {
      const lastIdx = lines.findIndex((l) => l.tl === lastCorrectTl);
      idx = lastIdx >= 0 ? (lastIdx + 1) % lines.length : 0;
      if (lines[idx]!.tl === lastCorrectTl) {
        idx = (idx + 1) % lines.length;
      }
    }
    const picked = lines[idx]!;
    return {
      tl: picked.tl,
      ...(picked.ar ? { ar: picked.ar } : {}),
      correct_index: idx,
    };
  }

  if (event.verdict === 'wrong' && event.consequence_tl) {
    return { tl: event.consequence_tl };
  }

  return { tl: 'Hmm… 🤔' };
}
