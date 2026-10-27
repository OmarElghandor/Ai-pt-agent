import type { Skill } from '@/lib/v2/content/lesson';

export type CardRating = 'again' | 'hard' | 'easy' | 'know';
export type MasteryLevel = 'learning' | 'mastered';
export type CardBucket = 'recent' | 'weak' | 'older';

export type SkillSrs = {
  interval: number;
  dueAt: string | null;
  streak: number;
  lapses: number;
};

export type CardSrs = {
  interval: number;
  dueAt: string | null;
  masteryLevel: MasteryLevel;
  consecutiveCorrect: number;
  face: string;
  knowCheckDueAt: string | null;
};

export type ItemLevels = {
  heard: number;
  understood: number;
  said: number;
  used: number;
};

export type ItemState = {
  user_id: string;
  item_id: string;
  target_lang: string;
  introducedDay: number;
  usedCorrectlyIn: string[];
  levels: ItemLevels;
  skills: Partial<Record<Skill, SkillSrs>>;
  card: CardSrs;
  lastImplicitReviewLocalDate: string | null;
  weakToolIds: string[];
};

export type ProgressError = {
  user_id: string;
  item_id?: string;
  tool_id?: string;
  skill?: Skill;
  category: 'grammar' | 'vocabulary' | 'spelling' | 'pronunciation';
  scope: string;
  wrong: string;
  right: string;
  at: string;
};

export type CardQueueEntry = {
  item_id: string;
  bucket: CardBucket;
  rating?: CardRating;
  rated_at?: string;
};

export type CardsSession = {
  user_id: string;
  kind: 'cards';
  local_date: string;
  status: 'open' | 'done';
  queue: CardQueueEntry[];
  tz?: string;
};

export type CardCandidate = {
  item_id: string;
  introducedDay: number;
  state: ItemState;
  isWeak: boolean;
  hasOpenReports: boolean;
  eligible: boolean;
};
