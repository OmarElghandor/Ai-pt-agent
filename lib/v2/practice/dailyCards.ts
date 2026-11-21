/**
 * كروت النهارده builder (16 §4) — fill to the cards time budget.
 */

import { STEP_SECONDS } from './stepTimes';
import { cardsWeightForPosition, type WindowLesson } from './window';
import { fillByBudget, rankPracticeItems } from './ranking';

export type CardSlotReason = 'weak' | 'window' | 'maint';

export type DailyCardCandidate = {
  item_id: string;
  lessonDay: number;
  essential?: boolean;
  isWeak?: boolean;
  /** Outside the window. */
  outsideWindow?: boolean;
  isDue?: boolean;
  isNew?: boolean;
  overdueMs?: number;
  stage?: number;
  /** افتكرتها+ outside window, due. */
  forMaint?: boolean;
  /** اتحفظت maintenance check. */
  masteredCheck?: boolean;
};

export type BuiltDailyCard = {
  item_id: string;
  slot: CardSlotReason;
  lessonDay: number;
};

export type BuildDailyCardsInput = {
  window: WindowLesson[];
  candidates: DailyCardCandidate[];
  budgetSeconds: number;
  /** Max new (never reviewed) cards. */
  maxNew?: number;
};

const CARD_SEC = STEP_SECONDS.card;

/**
 * Build today's card list: weak ≤25% (≤2 outside window), window 50/30/20,
 * تثبيت ≤15% (≤1 mastered check), ≤10 new. Newest lesson first; weak spread;
 * تثبيت last.
 */
export function buildDailyCards(input: BuildDailyCardsInput): BuiltDailyCard[] {
  const maxNew = input.maxNew ?? 10;
  const budget = input.budgetSeconds;
  const maxCards = Math.max(1, Math.floor(budget / CARD_SEC));
  const maxWeak = Math.max(0, Math.floor(maxCards * 0.25));
  const maxMaint = Math.max(0, Math.floor(maxCards * 0.15));

  const windowDays = new Set(input.window.map((w) => w.day));
  const posByDay = new Map(input.window.map((w) => [w.day, w.position]));

  const weakPool = rankPracticeItems(
    input.candidates.filter((c) => c.isWeak),
  );
  const weakIn: DailyCardCandidate[] = [];
  const weakOut: DailyCardCandidate[] = [];
  for (const c of weakPool) {
    if (windowDays.has(c.lessonDay) || !c.outsideWindow) weakIn.push(c);
    else weakOut.push(c);
  }
  const weakPicked: DailyCardCandidate[] = [];
  for (const c of weakIn) {
    if (weakPicked.length >= maxWeak) break;
    weakPicked.push(c);
  }
  let outsideWeak = 0;
  for (const c of weakOut) {
    if (weakPicked.length >= maxWeak) break;
    if (outsideWeak >= 2) break;
    weakPicked.push(c);
    outsideWeak += 1;
  }

  const pickedIds = new Set(weakPicked.map((c) => c.item_id));

  // Window shares 50/30/20 of remaining slots after weak
  const remainingSlots = Math.max(0, maxCards - weakPicked.length);
  const byPos: Record<1 | 2 | 3, DailyCardCandidate[]> = {
    1: [],
    2: [],
    3: [],
  };
  for (const c of input.candidates) {
    if (pickedIds.has(c.item_id)) continue;
    if (c.forMaint || c.masteredCheck) continue;
    const pos = posByDay.get(c.lessonDay);
    if (!pos) continue;
    if (!(c.isDue || c.isNew || c.stage === 1 || !c.isDue)) continue;
    byPos[pos].push(c);
  }
  for (const p of [1, 2, 3] as const) {
    byPos[p] = rankPracticeItems(byPos[p]);
  }

  const windowTargets = {
    1: Math.round(remainingSlots * cardsWeightForPosition(1)),
    2: Math.round(remainingSlots * cardsWeightForPosition(2)),
    3: Math.round(remainingSlots * cardsWeightForPosition(3)),
  };
  // Fix rounding so sum ≈ remainingSlots
  let wSum = windowTargets[1] + windowTargets[2] + windowTargets[3];
  while (wSum > remainingSlots) {
    for (const p of [3, 2, 1] as const) {
      if (windowTargets[p] > 0 && wSum > remainingSlots) {
        windowTargets[p] -= 1;
        wSum -= 1;
      }
    }
  }
  while (wSum < remainingSlots) {
    windowTargets[1] += 1;
    wSum += 1;
  }

  const windowPicked: DailyCardCandidate[] = [];
  let newCount = 0;
  for (const p of [1, 2, 3] as const) {
    let taken = 0;
    for (const c of byPos[p]) {
      if (taken >= windowTargets[p]) break;
      if (pickedIds.has(c.item_id)) continue;
      if (c.isNew && newCount >= maxNew) continue;
      windowPicked.push(c);
      pickedIds.add(c.item_id);
      if (c.isNew) newCount += 1;
      taken += 1;
    }
  }

  // Spill remaining window slots from newer positions
  const stillNeed =
    remainingSlots - windowPicked.length - Math.min(maxMaint, remainingSlots);
  if (stillNeed > 0) {
    const spill = rankPracticeItems(
      input.candidates.filter(
        (c) =>
          !pickedIds.has(c.item_id) &&
          windowDays.has(c.lessonDay) &&
          !c.forMaint &&
          !c.masteredCheck,
      ),
    );
    for (const c of spill) {
      if (windowPicked.length >= remainingSlots - Math.min(1, maxMaint)) break;
      if (c.isNew && newCount >= maxNew) continue;
      windowPicked.push(c);
      pickedIds.add(c.item_id);
      if (c.isNew) newCount += 1;
    }
  }

  // تثبيت up to 15%, at most 1 mastered check
  const maintPool = rankPracticeItems(
    input.candidates.filter(
      (c) =>
        !pickedIds.has(c.item_id) &&
        (c.forMaint || c.masteredCheck) &&
        c.isDue,
    ),
  );
  const maintPicked: DailyCardCandidate[] = [];
  let masteredChecks = 0;
  for (const c of maintPool) {
    if (maintPicked.length >= maxMaint) break;
    if (c.masteredCheck) {
      if (masteredChecks >= 1) continue;
      masteredChecks += 1;
    }
    maintPicked.push(c);
    pickedIds.add(c.item_id);
  }

  // Order: newest lesson → oldest; weak spread; تثبيت last
  const core = [...windowPicked].sort(
    (a, b) => (b.lessonDay ?? 0) - (a.lessonDay ?? 0),
  );
  const ordered: BuiltDailyCard[] = [];
  const weakQueue = [...weakPicked];
  const weakInterval = Math.max(
    1,
    Math.floor((core.length + weakQueue.length) / Math.max(1, weakQueue.length)),
  );
  let wi = 0;
  for (let i = 0; i < core.length; i++) {
    if (wi < weakQueue.length && i > 0 && i % weakInterval === 0) {
      const w = weakQueue[wi++]!;
      ordered.push({
        item_id: w.item_id,
        slot: 'weak',
        lessonDay: w.lessonDay,
      });
    }
    const c = core[i]!;
    ordered.push({
      item_id: c.item_id,
      slot: 'window',
      lessonDay: c.lessonDay,
    });
  }
  while (wi < weakQueue.length) {
    const w = weakQueue[wi++]!;
    ordered.push({
      item_id: w.item_id,
      slot: 'weak',
      lessonDay: w.lessonDay,
    });
  }
  for (const m of maintPicked) {
    ordered.push({
      item_id: m.item_id,
      slot: 'maint',
      lessonDay: m.lessonDay,
    });
  }

  // Trim to budget (repeats/صعب are outside this list)
  const trimmed = fillByBudget({
    candidates: ordered,
    budgetSeconds: budget,
    secondsPerItem: CARD_SEC,
  });
  return trimmed;
}

/** Approximate card count for a minutes budget. */
export function approxCardCount(cardsMinutes: number): number {
  return Math.floor((cardsMinutes * 60) / CARD_SEC);
}
