/**
 * Daily time budget split (16 §2.2).
 * Review always gets the largest share; cards stay ≥ 3 minutes.
 */

export const DEFAULT_DAILY_MINUTES = 30;
export const MIN_CARDS_MINUTES = 3;
export const REVIEW_ROUND_MINUTES = 5;
/** Fixed lesson share when there is a new lesson today (of a 30-min default). */
export const LESSON_MINUTES_AT_30 = 10;
export const REVIEW_MINUTES_WITH_LESSON_AT_30 = 14;
export const CARDS_MINUTES_WITH_LESSON_AT_30 = 6;

export type PracticeSplit = {
  lesson_minutes: number;
  review_minutes: number;
  cards_minutes: number;
};

export type PracticeBudgetInput = {
  daily_minutes?: number;
  has_lesson_today: boolean;
  /** Optional absolute override; still clamped so review is largest and cards ≥ 3. */
  split?: Partial<PracticeSplit> | null;
};

export function defaultDailyMinutesFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.PRACTICE_DAILY_MINUTES;
  const n = raw ? Number(raw) : DEFAULT_DAILY_MINUTES;
  if (!Number.isFinite(n) || n < MIN_CARDS_MINUTES + 1) {
    return DEFAULT_DAILY_MINUTES;
  }
  return Math.round(n);
}

/**
 * Split a daily budget into lesson / review / cards.
 * - With lesson at 30: 10 / 14 / 6
 * - Without: 0 / 21 / 9 (freed lesson time: 70% review, 30% cards)
 * - At other sizes: scale from 30, then enforce review largest + cards ≥ 3
 */
export function splitDailyBudget(input: PracticeBudgetInput): PracticeSplit {
  const daily = Math.max(
    MIN_CARDS_MINUTES + 1,
    Math.round(input.daily_minutes ?? DEFAULT_DAILY_MINUTES),
  );

  if (input.split) {
    return clampSplit(
      {
        lesson_minutes: input.split.lesson_minutes ?? 0,
        review_minutes: input.split.review_minutes ?? 0,
        cards_minutes: input.split.cards_minutes ?? MIN_CARDS_MINUTES,
      },
      daily,
      input.has_lesson_today,
    );
  }

  const scale = daily / DEFAULT_DAILY_MINUTES;
  if (input.has_lesson_today) {
    return clampSplit(
      {
        lesson_minutes: Math.round(LESSON_MINUTES_AT_30 * scale),
        review_minutes: Math.round(REVIEW_MINUTES_WITH_LESSON_AT_30 * scale),
        cards_minutes: Math.round(CARDS_MINUTES_WITH_LESSON_AT_30 * scale),
      },
      daily,
      true,
    );
  }

  // No lesson: start from with-lesson split, give freed lesson time 70/30
  const base = splitDailyBudget({
    daily_minutes: daily,
    has_lesson_today: true,
  });
  const freed = base.lesson_minutes;
  return clampSplit(
    {
      lesson_minutes: 0,
      review_minutes: base.review_minutes + Math.round(freed * 0.7),
      cards_minutes: base.cards_minutes + Math.round(freed * 0.3),
    },
    daily,
    false,
  );
}

function clampSplit(
  split: PracticeSplit,
  daily: number,
  hasLesson: boolean,
): PracticeSplit {
  let lesson = hasLesson ? Math.max(0, split.lesson_minutes) : 0;
  let cards = Math.max(MIN_CARDS_MINUTES, split.cards_minutes);
  let review = Math.max(0, split.review_minutes);

  const sum = lesson + cards + review;
  if (sum !== daily && sum > 0) {
    // Prefer adjusting review to match daily total
    review = Math.max(0, daily - lesson - cards);
  }

  // Review must be the largest share
  if (review < cards || (hasLesson && review < lesson)) {
    const others = lesson + cards;
    review = Math.max(review, Math.ceil((daily - others + review) / 2));
    // Rebalance: take from lesson first, then cards down to min
    let need = review + cards + lesson - daily;
    if (need > 0 && lesson > 0) {
      const take = Math.min(lesson, need);
      lesson -= take;
      need -= take;
    }
    if (need > 0 && cards > MIN_CARDS_MINUTES) {
      const take = Math.min(cards - MIN_CARDS_MINUTES, need);
      cards -= take;
    }
    review = daily - lesson - cards;
  }

  // Final: cards ≥ 3, review largest
  cards = Math.max(MIN_CARDS_MINUTES, Math.min(cards, daily - 1));
  if (!hasLesson) lesson = 0;
  review = daily - lesson - cards;
  if (review < cards) {
    const mid = Math.floor((review + cards) / 2);
    cards = Math.max(MIN_CARDS_MINUTES, Math.min(mid, daily - lesson - 1));
    review = daily - lesson - cards;
  }
  if (hasLesson && review < lesson) {
    lesson = Math.min(lesson, review);
    review = daily - lesson - cards;
  }

  return {
    lesson_minutes: lesson,
    review_minutes: Math.max(review, 0),
    cards_minutes: cards,
  };
}

/** Split review minutes into ~5-minute rounds; last round takes the remainder. */
export function reviewRounds(
  reviewMinutes: number,
  roundMinutes = REVIEW_ROUND_MINUTES,
): number[] {
  if (reviewMinutes <= 0) return [];
  if (reviewMinutes <= roundMinutes) return [reviewMinutes];
  const full = Math.floor(reviewMinutes / roundMinutes);
  const rem = reviewMinutes % roundMinutes;
  const rounds = Array.from({ length: full }, () => roundMinutes);
  if (rem > 0) rounds.push(rem);
  // If remainder is tiny, fold into last full round
  if (rem > 0 && rem < 2 && rounds.length > 1) {
    const lastFull = rounds[rounds.length - 2]!;
    return [...rounds.slice(0, -2), lastFull + rem];
  }
  return rounds;
}

export function cardsBudgetSeconds(cardsMinutes: number): number {
  return Math.max(0, cardsMinutes) * 60;
}

export function reviewBudgetSeconds(reviewMinutes: number): number {
  return Math.max(0, reviewMinutes) * 60;
}
