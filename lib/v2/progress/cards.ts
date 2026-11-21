import { isKnowCheckDue } from './know';
import type {
  CardBucket,
  CardCandidate,
  CardQueueEntry,
  CardsSession,
  ItemState,
} from './types';
import {
  approxCardCount,
  buildDailyCards,
  buildPracticeWindow,
  cardsBudgetSeconds,
  splitDailyBudget,
  type DailyCardCandidate,
  type WindowLesson,
} from '@/lib/v2/practice';

/** @deprecated Use time-budgeted build (16). Kept for older tests. */
export const DAILY_CARD_CAP = 15;
export const MIX_RECENT = 9;
export const MIX_WEAK = 4;
export const MIX_OLDER = 2;

export type BuildQueueInput = {
  currentDay: number;
  now?: Date;
  candidates: CardCandidate[];
  /** When set, uses 16 §4 window builder instead of legacy 9/4/2. */
  window?: WindowLesson[];
  budgetSeconds?: number;
  hasLessonToday?: boolean;
  dailyMinutes?: number;
};

/** Card/topic due: mastered → know-check; learning with no dueAt → due; else dueAt ≤ now. */
export function isDue(state: ItemState, now: Date): boolean {
  if (state.card.masteryLevel === 'mastered') {
    return isKnowCheckDue(state, now);
  }
  if (!state.card.dueAt) return true;
  return new Date(state.card.dueAt).getTime() <= now.getTime();
}

function toDailyCandidate(
  c: CardCandidate,
  windowDays: Set<number>,
  now: Date,
): DailyCardCandidate {
  const outside = !windowDays.has(c.introducedDay);
  const stage = c.state.stage ?? 1;
  const mastered = c.state.card.masteryLevel === 'mastered';
  const due = isDue(c.state, now);
  const isNew = !c.state.card.dueAt && c.state.card.interval === 0;
  const overdueMs =
    c.state.card.dueAt && due
      ? now.getTime() - new Date(c.state.card.dueAt).getTime()
      : 0;
  return {
    item_id: c.item_id,
    lessonDay: c.introducedDay,
    essential: false, // caller may enrich via item.priority later
    isWeak: c.isWeak || (c.state.weakToolIds?.length ?? 0) > 0,
    outsideWindow: outside,
    isDue: due,
    isNew,
    overdueMs,
    stage,
    forMaint: outside && stage >= 3 && due && !mastered,
    masteredCheck: mastered && due,
  };
}

/**
 * Build today's card queue.
 * With `window` / budget → 16 §4. Without → legacy 9/4/2 (tests).
 */
export function buildTodayQueue(input: BuildQueueInput): CardQueueEntry[] {
  const now = input.now ?? new Date();

  if (input.window || input.budgetSeconds != null) {
    const window =
      input.window ??
      buildPracticeWindow({
        currentDay: input.currentDay,
        completedDays: Array.from({ length: input.currentDay - 1 }, (_, i) => i + 1),
      });
    const split = splitDailyBudget({
      daily_minutes: input.dailyMinutes ?? 30,
      has_lesson_today: input.hasLessonToday ?? true,
    });
    const budgetSeconds =
      input.budgetSeconds ?? cardsBudgetSeconds(split.cards_minutes);
    const windowDays = new Set(window.map((w) => w.day));
    const eligible = input.candidates.filter(
      (c) => c.eligible && !c.hasOpenReports,
    );
    const dailyCandidates = eligible.map((c) =>
      toDailyCandidate(c, windowDays, now),
    );
    // Enrich essential from weakToolIds placeholder — real essential comes from items
    const built = buildDailyCards({
      window,
      candidates: dailyCandidates,
      budgetSeconds,
    });
    return built.map((b) => ({
      item_id: b.item_id,
      bucket: b.slot as CardBucket,
    }));
  }

  // Legacy 9/4/2
  return buildLegacy942(input, now);
}

function isRecent(introducedDay: number, currentDay: number): boolean {
  return introducedDay >= currentDay - 6 && introducedDay <= currentDay;
}

function isOlder(introducedDay: number, currentDay: number): boolean {
  return introducedDay < currentDay - 6;
}

function buildLegacy942(
  input: BuildQueueInput,
  now: Date,
): CardQueueEntry[] {
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
      if (isDue(c.state, now) || c.isWeak) weak.push(c);
    }
    if (isRecent(c.introducedDay, currentDay) && isDue(c.state, now)) {
      recent.push(c);
    } else if (isOlder(c.introducedDay, currentDay) && isDue(c.state, now)) {
      older.push(c);
    }
  }

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
    return n - taken;
  };

  let remRecent = take(recent, MIX_RECENT, 'recent');
  let remWeak = take(weak, MIX_WEAK, 'weak');
  let remOlder = take(older, MIX_OLDER, 'older');
  const spill = remRecent + remWeak + remOlder;
  if (spill > 0) {
    take([...recent, ...weak, ...older, ...eligible], spill, 'recent');
  }
  return out.slice(0, DAILY_CARD_CAP);
}

export function createCardsSession(opts: {
  user_id: string;
  local_date: string;
  queue: CardQueueEntry[];
  tz?: string;
  window?: WindowLesson[];
  budget_minutes?: number;
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

export { approxCardCount };
