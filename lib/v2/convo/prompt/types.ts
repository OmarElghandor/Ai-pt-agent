import type { ConvoEventFacts } from '@/lib/v2/convo/ladder';
import type { ConvoPackData } from '@/lib/v2/convo/pack';
import type { ConvoSelectCandidate } from '@/lib/v2/convo/select';
import type { ConvoExchange } from '@/lib/v2/convo/session';

export type ConvoPromptPart = {
  /** 1–6 matching 09 §5.1. */
  index: 1 | 2 | 3 | 4 | 5 | 6;
  label: string;
  text: string;
  /** Static / once-per-session parts marked for prompt caching. */
  cache: boolean;
};

export type BuildConvoPromptInput = {
  /** Lesson pack (Module A). Optional for free chat. */
  pack?: ConvoPackData | null;
  event: ConvoEventFacts;
  /** Pre-formatted event line; if omitted, formatConvoEventLine(event) is used. */
  eventLine?: string;
  candidates: ConvoSelectCandidate[];
  lastExchanges: ConvoExchange[];
  learnerAnswer: string;
  /** Optional two-line visual state summary for part 2. */
  visualStateSummary?: string;
  /** Module C free chat. */
  module?: 'lesson' | 'free';
  freeTopicTitle?: string;
  freeTopicPlace?: string;
  facts?: string[];
  suggestedWords?: string[];
  /** Persona JSON string (Module A + free CHARACTER block). */
  personaJson?: string;
  /** Surfaces already taught — Module A must not invent others. */
  taughtTls?: string[];
  /** Batch 9 free: authored next line the app will append. */
  nextLineTl?: string;
  /** v3: CURRENT GOAL prompt line. */
  currentGoalLine?: string;
  /** v3: scene time of day (code-owned). */
  sceneTimeOfDay?: string;
};

export type BuildConvoPromptResult = {
  parts: ConvoPromptPart[];
  assembled: string;
};
