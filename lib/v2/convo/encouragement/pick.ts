import type { PickCoachLineInput, PickCoachLineResult } from './types';
import { loadCoachBank } from './load';

const ITEM_SLOT = /\{item\}/g;

function fillSlots(eg: string, itemTl: string | undefined): string {
  if (!itemTl) return eg.replace(ITEM_SLOT, '…');
  return eg.replace(ITEM_SLOT, itemTl);
}

function pushRecent(recent: string[], id: string): string[] {
  const next = [...recent, id];
  return next.slice(-3);
}

/**
 * Pick a coach-bank line for a moment (09 §7).
 * Never repeats any of the last 3 line ids used in the session.
 */
export function pickCoachLine(
  input: PickCoachLineInput,
): PickCoachLineResult {
  const bank = input.bank ?? loadCoachBank();
  const lines = bank[input.moment];
  if (!lines || lines.length === 0) {
    throw new Error(`coach bank: no lines for moment "${input.moment}"`);
  }

  const recent = input.recentIds ?? [];
  const recentSet = new Set(recent);
  let pool = lines.filter((l) => !recentSet.has(l.id));
  if (pool.length === 0) {
    // All recently used — allow any except the very last if possible.
    const last = recent[recent.length - 1];
    pool = lines.filter((l) => l.id !== last);
    if (pool.length === 0) pool = [...lines];
  }

  const rnd = input.random ?? Math.random;
  const idx = Math.floor(rnd() * pool.length) % pool.length;
  const chosen = pool[idx] ?? pool[0];

  let eg = fillSlots(chosen.eg, input.itemTl);
  if (input.moment === 'miss_2' && input.memoryTrickEg) {
    eg = `${eg} — ${input.memoryTrickEg}`;
  }

  return {
    id: chosen.id,
    eg,
    recentIds: pushRecent(recent, chosen.id),
  };
}
