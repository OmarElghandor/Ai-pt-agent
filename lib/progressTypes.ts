import type { CefrLevel } from './prompts';
import type {
  AuthoredSegment,
  ExplanationExample,
  PromptShape,
} from './lessons/types';

export type PartnerMode = 'friend' | 'practice' | 'assessment';

export type MessageType =
  | 'chat'
  | 'praise'
  | 'hint'
  | 'correction'
  | 'near-miss'
  | 'reveal'
  | 'explanation'
  | 'teach'
  | 'repeat'
  | 'help'
  | 'task'
  | 'results'
  | 'legacy'
  | 'intro'
  | 'narration'
  | 'character'
  | 'coach';

export type LearnerVerdictLabel = 'صح' | 'قربت' | string;

/** Structured bilingual message used by the UI and TTS. */
export type TypedMessage = {
  id: string;
  role: 'user' | 'assistant';
  type: MessageType;
  at: number;
  /** Display segments. For chat, Portuguese only lives here. */
  segments: AuthoredSegment[];
  /** Hidden Arabic translation of a chat message (shown on tap). */
  translation?: AuthoredSegment[];
  /** Amber bubble label: قربت / تصحيح */
  label?: string;
  /** Standalone correct Portuguese sentence with a play button. */
  playablePt?: string;
  /** Explanation examples (legacy). */
  examples?: ExplanationExample[];
  /** Teach-step meaning row (phrase card). */
  teachMeaning?: { pt: string; meaningAr: string };
  /** Contextual example on a teach card. */
  teachExample?: { pt: string; meaningAr: string };
  /** Egyptian explanation shown on a teach card. */
  teachExplanation?: { text: string; pronunciation: string };
  /** Task / translate prompt card. */
  prompt?: PromptShape;
  /** Status under a learner answer in Practice / Assessment. */
  learnerVerdict?: LearnerVerdictLabel;
  /** Raw tagged legacy content (old threads). */
  legacyContent?: string;
  /** Story character name on a character line. */
  speaker?: string;
};

/** Context for Prompt 4 (lesson reaction) streamed by the chat route. */
export type LessonReactionContext = {
  mode: 'practice' | 'assessment' | 'side';
  verdict: 'correct' | 'near_miss' | 'wrong';
  source: 'code' | 'you';
  attempt: number;
  accepted?: string;
  mistakeNote?: string;
  hintNote?: string;
  whyNote?: string;
  nudgeNote?: string;
  criterion?: string;
  guard?: string;
  /** Sentence start shown on this beat, such as "Pode trazer …". */
  frame?: string;
  /** Coach tip already visible, raw text, with the Portuguese left inside it. */
  coachTip?: string;
  /** Word-bank entries for this beat, "pt (meaning)" joined. */
  wordBank?: string;
  currentPromptPlain: string;
  /** Pattern such as "Sou de [CITY]." when the answer is personal and the model must grade it. */
  slotPattern?: string;
  nextPrompt?: TypedMessage;
  /** Prefer when more than one follow-up message (e.g. teach card + repeat). */
  nextPrompts?: TypedMessage[];
  situation?: string;
  lessonTarget?: string;
  recentPraise: string[];
  characterName?: string;
  characterRole?: string;
  sceneTitle?: string;
  beatLine?: string;
  reactionCue?: string;
  /** Next story line, context only. The app sends it after this reaction. */
  nextLine?: string;
  recentCharacterReactions?: string[];
};

export type ItemOutcome = 'correct' | 'near-miss' | 'learned-with-help' | 'skipped' | 'fail' | 'pass';

export type PracticeFocus = {
  lessonId: string;
  beatIndex: number;
  attemptsOnCurrent: number;
  itemOutcomes: Record<string, ItemOutcome>;
  phase: 'story' | 'friend-bridge';
  /** Turns left in the post-practice Friend bridge (default 5). */
  friendBridgeTurnsLeft: number;
  /** Re-ask uses the beat's alternative line. */
  useAltLine: boolean;
  /** Supported coach tip already revealed this beat. */
  coachTipShown: boolean;
};

export type AssessmentFocus = {
  lessonId: string;
  taskIndex: number;
  attemptsOnCurrent: number;
  /** Per-task outcome keyed by task id. */
  taskOutcomes: Record<string, 'pass' | 'fail'>;
};

export type LessonRecord = {
  lessonId: string;
  practisedAt?: number;
  paused?: PracticeFocus;
  /** Latest assessment results keyed by target. */
  assessmentByTarget?: Record<string, 'pass' | 'fail'>;
  lastAssessedAt?: number;
};

export type OpenerSituation = 'first' | 'returning' | 'paused' | 'finished';

export type TurnLogDetail = {
  mode: PartnerMode;
  lessonId: string | null;
  stage: string | null;
  itemId: string | null;
  script: 'latin' | 'arabic-only' | 'empty';
  gradingSource: 'code' | 'model' | 'none';
  verdict: string | null;
  matchedAnswer: string | null;
  modelVerdictRaw: string | null;
  messageTypes: MessageType[];
  modelLatencyMs: number | null;
  finishReason: string | null;
  outputTokens: number | null;
};

export type Progress = {
  mode: PartnerMode;
  practice: PracticeFocus | null;
  assessment: AssessmentFocus | null;
  lessons: Record<string, LessonRecord>;
  lastPractisedLessonId: string | null;
  /** After a lesson is marked practised, flash finished opener once. */
  finishedLastTime: boolean;
  openerCursor: Partial<Record<OpenerSituation, number>>;
  lastOpenerSituation: OpenerSituation | null;
  lastLogLine: string;
  lastTurnLog: TurnLogDetail | null;
  /** Rotating praise index so the same phrase never appears twice in a row. */
  lastPraiseIndex: number;
  /** Last few praise Portuguese phrases (for Prompt 4 RECENT_PRAISE). */
  recentPraise: string[];
  /** Last character reactions, so Prompt 4 does not repeat them. */
  recentCharacterReactions: string[];
};

export type LearnerFile = {
  id: string;
  level: CefrLevel;
  visible: TypedMessage[];
  archive: TypedMessage[];
  progress: Progress;
  createdAt: number;
  updatedAt: number;
};

export type TurnAction =
  | { type: 'message' }
  | { type: 'start-practice'; lessonId: string }
  | { type: 'resume-practice' }
  | { type: 'end-practice' }
  | { type: 'start-assessment'; lessonId: string }
  | { type: 'show-coach-tip' };

export type Chip = {
  id: string;
  label: string;
  action: TurnAction;
};

export const PRAISE_PHRASES: { pt: string; ar: string; pronunciation: string }[] = [
  { pt: 'Isso mesmo!', ar: 'كده بالظبط!', pronunciation: 'كِدَه بِالظَّبْط!' },
  { pt: 'Muito bem!', ar: 'برافو!', pronunciation: 'بَرافو!' },
  { pt: 'Perfeito!', ar: 'تمام!', pronunciation: 'تَمام!' },
  { pt: 'Boa!', ar: 'حلو!', pronunciation: 'حِلْو!' },
];

export function emptyTurnLog(): TurnLogDetail {
  return {
    mode: 'friend',
    lessonId: null,
    stage: null,
    itemId: null,
    script: 'empty',
    gradingSource: 'none',
    verdict: null,
    matchedAnswer: null,
    modelVerdictRaw: null,
    messageTypes: [],
    modelLatencyMs: null,
    finishReason: null,
    outputTokens: null,
  };
}

export function emptyProgress(): Progress {
  return {
    mode: 'friend',
    practice: null,
    assessment: null,
    lessons: {},
    lastPractisedLessonId: null,
    finishedLastTime: false,
    openerCursor: {},
    lastOpenerSituation: null,
    lastLogLine: '',
    lastTurnLog: null,
    lastPraiseIndex: -1,
    recentPraise: [],
    recentCharacterReactions: [],
  };
}

function isTypedMessage(value: unknown): value is TypedMessage {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return (
    (m.role === 'user' || m.role === 'assistant') &&
    typeof m.type === 'string' &&
    typeof m.at === 'number' &&
    Array.isArray(m.segments)
  );
}

/** Convert an old {role, content, at} message into a typed legacy message. */
export function migrateStoredMessage(raw: unknown, index: number): TypedMessage {
  if (isTypedMessage(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const m = raw as Record<string, unknown>;
    const role = m.role === 'user' ? 'user' : 'assistant';
    const content = typeof m.content === 'string' ? m.content : '';
    const at = typeof m.at === 'number' ? m.at : Date.now() + index;
    return {
      id: `legacy-${index}-${at}`,
      role,
      type: 'legacy',
      at,
      segments: [],
      legacyContent: content,
    };
  }
  return {
    id: `legacy-${index}`,
    role: 'assistant',
    type: 'legacy',
    at: Date.now(),
    segments: [],
    legacyContent: '',
  };
}

function migratePracticeFocus(raw: unknown): PracticeFocus | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.lessonId !== 'string') return null;
  const legacyPhase = o.phase === 'explanation' ? 'teach' : o.phase;
  const phase = legacyPhase === 'friend-bridge' ? 'friend-bridge' : 'story';
  const beatIndex =
    typeof o.beatIndex === 'number'
      ? o.beatIndex
      : typeof o.itemIndex === 'number' && o.itemIndex >= 0
        ? o.itemIndex
        : typeof o.teachStepIndex === 'number'
          ? o.teachStepIndex
          : 0;
  return {
    lessonId: o.lessonId,
    beatIndex,
    attemptsOnCurrent: typeof o.attemptsOnCurrent === 'number' ? o.attemptsOnCurrent : 0,
    itemOutcomes:
      o.itemOutcomes && typeof o.itemOutcomes === 'object'
        ? (o.itemOutcomes as PracticeFocus['itemOutcomes'])
        : {},
    phase,
    friendBridgeTurnsLeft:
      typeof o.friendBridgeTurnsLeft === 'number' ? o.friendBridgeTurnsLeft : 0,
    useAltLine: o.useAltLine === true,
    coachTipShown: o.coachTipShown === true,
  };
}

function migrateAssessmentFocus(raw: unknown): AssessmentFocus | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.lessonId !== 'string') return null;
  return {
    lessonId: o.lessonId,
    taskIndex: typeof o.taskIndex === 'number' ? o.taskIndex : 0,
    attemptsOnCurrent: typeof o.attemptsOnCurrent === 'number' ? o.attemptsOnCurrent : 0,
    taskOutcomes:
      o.taskOutcomes && typeof o.taskOutcomes === 'object'
        ? (o.taskOutcomes as AssessmentFocus['taskOutcomes'])
        : {},
  };
}

/** Migrate older learner files (mission/topic or early lesson shapes) to Friend. */
export function migrateProgress(raw: unknown): Progress {
  const base = emptyProgress();
  if (!raw || typeof raw !== 'object') return base;
  const src = raw as Record<string, unknown>;

  // New three-mode shape
  if (
    src.mode === 'friend' ||
    src.mode === 'practice' ||
    src.mode === 'assessment' ||
    src.practice ||
    src.assessment ||
    src.lessons
  ) {
    const lessons: Record<string, LessonRecord> = {};
    if (src.lessons && typeof src.lessons === 'object') {
      for (const [id, rec] of Object.entries(src.lessons as Record<string, unknown>)) {
        if (!rec || typeof rec !== 'object') continue;
        const r = rec as Record<string, unknown>;
        lessons[id] = {
          lessonId: id,
          practisedAt: typeof r.practisedAt === 'number' ? r.practisedAt : undefined,
          paused: migratePracticeFocus(r.paused) ?? undefined,
          assessmentByTarget:
            r.assessmentByTarget && typeof r.assessmentByTarget === 'object'
              ? (r.assessmentByTarget as Record<string, 'pass' | 'fail'>)
              : undefined,
          lastAssessedAt: typeof r.lastAssessedAt === 'number' ? r.lastAssessedAt : undefined,
        };
      }
    }

    return {
      ...base,
      mode:
        src.mode === 'practice' || src.mode === 'assessment' || src.mode === 'friend'
          ? src.mode
          : 'friend',
      practice: migratePracticeFocus(src.practice),
      assessment: migrateAssessmentFocus(src.assessment),
      lessons,
      lastPractisedLessonId:
        typeof src.lastPractisedLessonId === 'string' ? src.lastPractisedLessonId : null,
      finishedLastTime: Boolean(src.finishedLastTime),
      openerCursor:
        src.openerCursor && typeof src.openerCursor === 'object'
          ? (src.openerCursor as Progress['openerCursor'])
          : {},
      lastOpenerSituation:
        typeof src.lastOpenerSituation === 'string'
          ? (src.lastOpenerSituation as Progress['lastOpenerSituation'])
          : null,
      lastLogLine: typeof src.lastLogLine === 'string' ? src.lastLogLine : '',
      lastTurnLog:
        src.lastTurnLog && typeof src.lastTurnLog === 'object'
          ? (src.lastTurnLog as TurnLogDetail)
          : null,
      lastPraiseIndex: typeof src.lastPraiseIndex === 'number' ? src.lastPraiseIndex : -1,
      recentPraise: Array.isArray(src.recentPraise)
        ? (src.recentPraise as string[]).filter((s) => typeof s === 'string').slice(-5)
        : [],
      recentCharacterReactions: Array.isArray(src.recentCharacterReactions)
        ? (src.recentCharacterReactions as string[]).filter((s) => typeof s === 'string').slice(-3)
        : [],
    };
  }

  // Legacy mission/topic → Friend, keep opener cursor / finished flag if present
  return {
    ...base,
    finishedLastTime: Boolean(src.finishedLastTime),
    openerCursor:
      src.openerCursor && typeof src.openerCursor === 'object'
        ? (src.openerCursor as Progress['openerCursor'])
        : {},
    lastOpenerSituation:
      typeof src.lastOpenerSituation === 'string'
        ? (src.lastOpenerSituation as Progress['lastOpenerSituation'])
        : null,
    lastLogLine: typeof src.lastLogLine === 'string' ? src.lastLogLine : '',
  };
}
