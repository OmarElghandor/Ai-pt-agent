import type { CardRating, CardSrs, ItemState, SkillSrs } from './types';
import type { Skill } from '@/lib/v2/content/lesson';

export const EASY_LADDER = [1, 3, 7, 14, 21] as const;

export function emptySkillSrs(): SkillSrs {
  return { interval: 0, dueAt: null, streak: 0, lapses: 0 };
}

export function emptyCardSrs(): CardSrs {
  return {
    interval: 0,
    dueAt: null,
    masteryLevel: 'learning',
    consecutiveCorrect: 0,
    face: 'recognize',
    knowCheckDueAt: null,
  };
}

export function createItemState(opts: {
  user_id: string;
  item_id: string;
  introducedDay: number;
  target_lang?: string;
}): ItemState {
  return {
    user_id: opts.user_id,
    item_id: opts.item_id,
    target_lang: opts.target_lang ?? 'pt-PT',
    introducedDay: opts.introducedDay,
    usedCorrectlyIn: [],
    levels: { heard: 0, understood: 0, said: 0, used: 0 },
    skills: {},
    card: emptyCardSrs(),
    lastImplicitReviewLocalDate: null,
    weakToolIds: [],
  };
}

export function nextEasyInterval(current: number): number {
  for (const step of EASY_LADDER) {
    if (current < step) return step;
  }
  return Math.max(21, current);
}

function addDaysIso(from: Date, days: number): string {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/** Apply again/hard/easy to card SRS (not know — see know.ts). */
export function applyCardRating(
  card: CardSrs,
  rating: Exclude<CardRating, 'know'>,
  now: Date = new Date(),
): CardSrs {
  if (rating === 'again') {
    return {
      ...card,
      interval: 0,
      dueAt: now.toISOString(),
      consecutiveCorrect: 0,
      masteryLevel: 'learning',
      knowCheckDueAt: null,
      face: 'recognize',
    };
  }
  if (rating === 'hard') {
    const interval = Math.max(1, Math.ceil(Math.max(card.interval, 1) * 1.2));
    return {
      ...card,
      interval,
      dueAt: addDaysIso(now, interval),
      consecutiveCorrect: 0,
      masteryLevel: 'learning',
    };
  }
  // easy
  const interval = nextEasyInterval(card.interval);
  const consecutiveCorrect = card.consecutiveCorrect + 1;
  let face = card.face;
  if (consecutiveCorrect >= 2 && face === 'recognize') face = 'listen';
  else if (consecutiveCorrect >= 4 && face === 'listen') face = 'produce';
  return {
    ...card,
    interval,
    dueAt: addDaysIso(now, interval),
    consecutiveCorrect,
    face,
  };
}

export function applySkillRating(
  skill: SkillSrs | undefined,
  correct: boolean,
  now: Date = new Date(),
): SkillSrs {
  const cur = skill ?? emptySkillSrs();
  if (!correct) {
    return {
      interval: 0,
      dueAt: now.toISOString(),
      streak: 0,
      lapses: cur.lapses + 1,
    };
  }
  const interval = nextEasyInterval(cur.interval);
  return {
    interval,
    dueAt: addDaysIso(now, interval),
    streak: cur.streak + 1,
    lapses: cur.lapses,
  };
}

/** Graduation: interval ≥ 21 AND usedCorrectlyIn in ≥2 situations. */
export function tryGraduate(state: ItemState): ItemState {
  if (
    state.card.masteryLevel === 'mastered' &&
    !state.card.knowCheckDueAt
  ) {
    return state;
  }
  if (
    state.card.interval >= 21 &&
    state.usedCorrectlyIn.length >= 2 &&
    state.card.masteryLevel !== 'mastered'
  ) {
    return {
      ...state,
      card: {
        ...state.card,
        masteryLevel: 'mastered',
        knowCheckDueAt: null,
      },
    };
  }
  return state;
}

export function situationId(day: number): string {
  return `day:${day}`;
}

export function bumpSkill(
  state: ItemState,
  skill: Skill,
  correct: boolean,
  now?: Date,
): ItemState {
  return {
    ...state,
    skills: {
      ...state.skills,
      [skill]: applySkillRating(state.skills[skill], correct, now),
    },
  };
}
