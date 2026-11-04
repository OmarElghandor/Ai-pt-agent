import type { CoachMoment } from '@/lib/v2/convo/ladder';

export type CoachBankLine = {
  id: string;
  eg: string;
};

export type CoachBank = Record<string, CoachBankLine[]>;

export type PickCoachLineInput = {
  moment: CoachMoment | 'returned_after_break' | 'arabic_answer';
  /** Fills `{item}` slots. */
  itemTl?: string;
  /** Appended on miss_2 (09 §7). */
  memoryTrickEg?: string;
  /** Last ≤3 line ids used in the session. */
  recentIds?: string[];
  /** Optional bank override (tests). */
  bank?: CoachBank;
  /** Deterministic pick for tests (0..1). */
  random?: () => number;
};

export type PickCoachLineResult = {
  id: string;
  eg: string;
  /** Updated recent ids (newest last, max 3). */
  recentIds: string[];
};
