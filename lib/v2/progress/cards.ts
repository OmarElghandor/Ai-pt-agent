import { isKnowCheckDue } from './know';
import type {
  CardBucket,
  CardCandidate,
  CardQueueEntry,
  CardsSession,
  ItemState,
} from './types';

export const DAILY_CARD_CAP = 15;
export const MIX_RECENT = 9;
export const MIX_WEAK = 4;
export const MIX_OLDER = 2;

export type BuildQueueInput = {
  /** Curriculum "today" day number for recent window. */
  currentDay: number;
  now?: Date;
  /** Eligible candidates (already filtered for has_card / reports). */
  candidates: CardCandidate[];
};

function isDue(state: ItemState, now: Date): boolean {
  if (state.card.masteryLevel === 'mastered') {
    return isKnowCheckDue(state, now);
  }
  if (!state.card.dueAt) return true; // never reviewed → due
  return new Date(state.card.dueAt).getTime() <= now.getTime();
}

function isRecent(introducedDay: number, currentDay: number): boolean {
  return introducedDay >= currentDay - 6 && introducedDay <= currentDay;
}

function isOlder(introducedDay: number, currentDay: number): boolean {
  return introducedDay < currentDay - 6;
}

/**
 * Pure 9/4/2 mix. Cap 15. Spill unfilled slots toward recent.
 * Missed days never create a backlog count — just pick ≤15 due/weak/recent.
 */
export function buildTodayQueue(input: BuildQueueInput): CardQueueEntry[] {
  const now = input.now ?? new Date();
  const currentDay = input.currentDay;

  const eligible = input.candidates.filter((c) => {
    if (!c.eligible || c.hasOpenReports) return false;
    if (c.state.card.masteryLevel === 'mastered') {
      return isKnowCheckDue(c.state, now);
    }
    return true;
  });

  const recent: CardCandidate[] = [];
  const weak: CardCandidate[] = [];
  const older: CardCandidate[] = [];

  for (const c of eligible) {
    if (c.isWeak || (c.state.weakToolIds?.length ?? 0) > 0) {
      // weak bucket prefers weak; still only if due-ish or recent miss
      if (isDue(c.state, now) || c.isWeak) weak.push(c);
    }
    if (isRecent(c.introducedDay, currentDay) && isDue(c.state, now)) {
      recent.push(c);
    } else if (isOlder(c.introducedDay, currentDay) && isDue(c.state, now)) {
      older.push(c);
    } else if (isDue(c.state, now) && isRecent(c.introducedDay, currentDay)) {
      recent.push(c);
    }
  }

  // Also include never-reviewed recent items even if dueAt null already handled
  for (const c of eligible) {
    if (
      isRecent(c.introducedDay, currentDay) &&
      !recent.includes(c) &&
      c.state.card.masteryLevel !== 'mastered'
    ) {
      recent.push(c);
    }
  }

  const picked = new Set<string>();
  const out: CardQueueEntry[] = [];

  const take = (list: CardCandidate[], n: number, bucket: CardBucket) => {
    let taken = 0;
    for (const c of list) {
      if (taken >= n) break;
      if (picked.has(c.item_id)) continue;
      picked.add(c.item_id);
      out.push({ item_id: c.item_id, bucket });
      taken += 1;
    }
    return n - taken; // remaining slots
  };

  let remRecent = take(recent, MIX_RECENT, 'recent');
  let remWeak = take(weak, MIX_WEAK, 'weak');
  let remOlder = take(older, MIX_OLDER, 'older');

  // Spill toward recent, then weak, then older
  const spillPool = [...recent, ...weak, ...older, ...eligible];
  const spill = remRecent + remWeak + remOlder;
  if (spill > 0) {
    take(spillPool, spill, 'recent');
  }

  return out.slice(0, DAILY_CARD_CAP);
}

/**
 * Frozen session helpers (pure). Persistence is outside.
 */
export function createCardsSession(opts: {
  user_id: string;
  local_date: string;
  queue: CardQueueEntry[];
  tz?: string;
}): CardsSession {
  return {
    user_id: opts.user_id,
    kind: 'cards',
    local_date: opts.local_date,
    status: 'open',
    queue: opts.queue.map((q) => ({ ...q })),
    tz: opts.tz,
  };
}

export function reopenCardsSession(session: CardsSession): CardsSession {
  // Same queue; if done stays done — no refill
  return {
    ...session,
    queue: session.queue.map((q) => ({ ...q })),
  };
}

export function markCardRated(
  session: CardsSession,
  itemId: string,
  rating: NonNullable<CardQueueEntry['rating']>,
  at: Date = new Date(),
): CardsSession {
  const queue = session.queue.map((q) =>
    q.item_id === itemId
      ? { ...q, rating, rated_at: at.toISOString() }
      : q,
  );
  const allRated =
    queue.length === 0 || queue.every((q) => Boolean(q.rating));
  return {
    ...session,
    queue,
    status: allRated ? 'done' : 'open',
  };
}
