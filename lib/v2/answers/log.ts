import { V2AnswersModel } from '@/lib/v2/mongo/models';
import type { AnswerPayload } from './payload';

export const ANSWER_TIME_MS_CAP = 180_000;

export type AnswerLogSource =
  | 'review'
  | 'lesson'
  | 'grammar_check'
  | 'micro'
  | 'find_image'
  | 'cards'
  | 'roleplay'
  | 'convo';

export type AnswerLogVerdict =
  | 'correct'
  | 'near_miss'
  | 'wrong'
  | 'unclear'
  | 'self_rated';

export type AnswerLogDoc = {
  user_id: string;
  local_date: string;
  answer_id: string;
  question_id: string;
  question_version: string;
  source: AnswerLogSource;
  session_id?: string;
  round?: number;
  step_index?: number;
  attempt: number;
  first_try: boolean;
  answer: unknown;
  verdict: AnswerLogVerdict;
  hint_used: boolean;
  skill?: string;
  tests: { item_ids: string[]; pattern_ids: string[] };
  lesson_day?: number;
  window_position?: number;
  error_id?: string;
  time_ms: number;
  stage_moves: {
    item_id: string;
    from: number;
    to: number;
    answer_id?: string;
  }[];
};

export type AnswerLogStore = {
  insert: (doc: AnswerLogDoc) => Promise<void>;
};

const mongoLogStore: AnswerLogStore = {
  async insert(doc) {
    await V2AnswersModel().updateOne(
      { answer_id: doc.answer_id },
      { $setOnInsert: doc },
      { upsert: true },
    );
  },
};

let activeLogStore: AnswerLogStore = mongoLogStore;

/** Test helper — swap the persistence backend. */
export function setAnswerLogStore(store: AnswerLogStore | null): void {
  activeLogStore = store ?? mongoLogStore;
}

export function capTimeMs(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.min(Math.floor(value), ANSWER_TIME_MS_CAP);
}

export function mapAnswerSource(payload: AnswerPayload): AnswerLogSource {
  switch (payload.kind) {
    case 'beat':
    case 'scene_mistake':
      return 'roleplay';
    case 'card_review':
      return 'cards';
    case 'convo':
      return 'convo';
    case 'closed':
      if (payload.question_type === 'micro_check') return 'micro';
      if (payload.question_type === 'find_image') return 'find_image';
      if (payload.skill === 'grammar') return 'grammar_check';
      return 'lesson';
    case 'open':
      if (payload.question_type === 'micro_check') return 'micro';
      if (payload.skill === 'grammar') return 'grammar_check';
      return 'lesson';
    case 'page_ask':
    case 'page_quiz':
      return payload.kind === 'page_quiz' && payload.page_id.includes('grammar')
        ? 'grammar_check'
        : 'lesson';
    default:
      return 'lesson';
  }
}

function mapVerdict(raw: string | undefined): AnswerLogVerdict {
  switch (raw) {
    case 'correct':
    case 'near_miss':
    case 'wrong':
    case 'unclear':
    case 'self_rated':
      return raw;
    case 'arabic_only':
      return 'wrong';
    default:
      return 'unclear';
  }
}

function questionRef(payload: AnswerPayload): {
  question_id: string;
  question_version: string;
} {
  if (payload.kind === 'card_review') {
    return { question_id: payload.item_id, question_version: 'card' };
  }
  if (payload.kind === 'scene_mistake') {
    return {
      question_id: `scene_mistake:${payload.scene_id}:${payload.goal_id}`,
      question_version: '1',
    };
  }
  if (payload.kind === 'beat') {
    return {
      question_id: `beat:${payload.day}:${payload.beat_id}`,
      question_version: '1',
    };
  }
  if (payload.kind === 'page_ask') {
    return {
      question_id: `page_ask:${payload.day}:${payload.page_id}:${payload.step_index}`,
      question_version: '1',
    };
  }
  if ('question_id' in payload && typeof payload.question_id === 'string') {
    return { question_id: payload.question_id, question_version: '1' };
  }
  if (payload.kind === 'convo') {
    return {
      question_id: payload.question_id ?? `convo:${payload.item_id}:${payload.rung}`,
      question_version: '1',
    };
  }
  return { question_id: `answer:${payload.answer_id}`, question_version: '1' };
}

function answerGiven(payload: AnswerPayload): unknown {
  switch (payload.kind) {
    case 'page_ask':
    case 'page_quiz':
      return { option_index: payload.option_index };
    case 'closed':
      return { option_index: payload.option_index };
    case 'open':
      return { text: payload.text };
    case 'beat':
      return {
        text: payload.text,
        option_id: payload.option_id,
        answer_source: payload.answer_source,
      };
    case 'convo':
      return { rung: payload.rung };
    case 'card_review':
      return { rating: payload.rating };
    case 'scene_mistake':
      return {
        learner_tl: payload.learner_tl,
        wrong: payload.wrong,
        right: payload.right,
        stopped: payload.stopped,
      };
  }
}

function itemIds(payload: AnswerPayload): string[] {
  if ('item_id' in payload && typeof payload.item_id === 'string' && payload.item_id) {
    return [payload.item_id];
  }
  return [];
}

function skillOf(payload: AnswerPayload): string | undefined {
  if ('skill' in payload && typeof payload.skill === 'string') return payload.skill;
  if (payload.kind === 'card_review') return 'reading';
  if (payload.kind === 'convo') return payload.rung === 'said' ? 'speaking' : 'listening';
  return undefined;
}

export type BuildAnswerLogInput = {
  payload: AnswerPayload;
  user_id: string;
  local_date: string;
  verdict?: string;
  first_try?: boolean;
  attempt?: number;
  hint_used?: boolean;
  error_id?: string;
  time_ms?: number;
  session_id?: string;
  question_version?: string;
  stage_moves?: AnswerLogDoc['stage_moves'];
};

export function buildAnswerLogDoc(input: BuildAnswerLogInput): AnswerLogDoc {
  const { payload } = input;
  const ref = questionRef(payload);
  const session_id =
    input.session_id ??
    ('session_id' in payload && typeof payload.session_id === 'string'
      ? payload.session_id
      : undefined);
  const attempt = input.attempt ?? 1;
  const first_try =
    input.first_try ?? (payload.kind === 'beat' ? attempt === 1 : true);

  return {
    user_id: input.user_id,
    local_date: input.local_date,
    answer_id: payload.answer_id,
    question_id: ref.question_id,
    question_version: input.question_version ?? ref.question_version,
    source: mapAnswerSource(payload),
    session_id,
    attempt,
    first_try,
    answer: answerGiven(payload),
    verdict: mapVerdict(input.verdict),
    hint_used:
      input.hint_used ??
      (payload.kind === 'card_review' ? payload.hint === true : false),
    skill: skillOf(payload),
    tests: { item_ids: itemIds(payload), pattern_ids: [] },
    lesson_day: payload.day,
    error_id: input.error_id,
    time_ms: capTimeMs(
      input.time_ms ??
        ('time_ms' in payload ? (payload as { time_ms?: number }).time_ms : 0),
    ),
    stage_moves: input.stage_moves ?? [],
  };
}

export async function persistAnswerLog(doc: AnswerLogDoc): Promise<void> {
  await activeLogStore.insert(doc);
}

export async function recordAnswerLog(
  input: BuildAnswerLogInput,
): Promise<AnswerLogDoc> {
  const doc = buildAnswerLogDoc(input);
  await persistAnswerLog(doc);
  try {
    const { scheduleLevelJobsAfterAnswer } = await import(
      '@/lib/v2/practice/levelJob'
    );
    scheduleLevelJobsAfterAnswer({
      userId: doc.user_id,
      questionId: doc.question_id,
    });
  } catch {
    // Level rebuild is best-effort and must never block answers.
  }
  return doc;
}
