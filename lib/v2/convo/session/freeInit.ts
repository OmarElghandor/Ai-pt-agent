import type { FreeTopic } from '@/lib/v2/convo/topics';
import {
  isOpenTopicId,
  loadFreeTopicsFile,
  loadThreadTopic,
} from '@/lib/v2/convo/topics';
import {
  composeOpeningBubbleAr,
  composeOpeningBubbleTl,
  fillNameSlot,
  openingNextLine,
} from '@/lib/v2/convo/free';
import {
  firstOpenGoalId,
  goalStatesFromBank,
  loadGoalsForDay,
  loadGoalsForTopic,
  pendingFrameFromGoal,
  type ConvoGoalBank,
  type ConvoSceneTimeOfDay,
} from '@/lib/v2/convo/goals';
import type { ConvoOpeningBubbles, ConvoSession } from './types';

/** Synthetic pack_id for free-chat sessions (store uniqueness). */
export function freePackId(topicId: string): string {
  return `free.${topicId}`;
}

/** Opening chips for «أي حاجة»: catalog titles + day. */
export function openModeOpeningChips(): string[] {
  const titles = loadFreeTopicsFile().topics.map((t) => `Sobre ${t.title_in_sentence_tl}`);
  return [...titles.slice(0, 8), 'Sobre o meu dia'];
}

/** Fixed opening chips for «أي حاجة» (E5) — not catalog titles. */
export const OPEN_MODE_OPENING_CHIPS = [
  'Sobre o meu dia',
  'Futebol',
  'Comida',
  'O trabalho',
] as const;

/** Default open-mode answer frame (also stored as pending_frame). */
export function openModeOpeningFrame(): {
  tl: string;
  eg: string;
  chips: string[];
} {
  return {
    tl: 'Quero falar de ___.',
    eg: 'قول عايز تتكلم عن إيه',
    chips: [...OPEN_MODE_OPENING_CHIPS],
  };
}

export function buildOpenOpeningBubbles(opts?: {
  topic?: FreeTopic;
  learnerName?: string | null;
}): ConvoOpeningBubbles {
  const topic = opts?.topic;
  const tl = fillNameSlot(
    topic?.opening_tl ??
      'Olá {name}! 😊 Sobre o que queres falar hoje?',
    opts?.learnerName,
  );
  const ar = fillNameSlot(
    topic?.opening_ar ??
      'مرحباً {name}! 🙂 عن ماذا تريد أن تتحدث اليوم؟',
    opts?.learnerName,
  );
  return {
    character: { tl, ar },
    coach_intros: topic?.intro_eg
      ? [{ item_id: topic.id, coach_intro_eg: topic.intro_eg }]
      : [
          {
            item_id: 'open',
            coach_intro_eg: 'اتكلم في أي موضوع إنت عايزه — أنا معاكي.',
          },
        ],
    card_ids: [],
  };
}

export function buildFreeOpeningBubbles(
  topic: FreeTopic,
  opts?: {
    learnerName?: string | null;
    lessonDay?: number | null;
    bank?: ConvoGoalBank | null;
  },
): ConvoOpeningBubbles {
  if (isOpenTopicId(topic.id) && !opts?.bank && !opts?.lessonDay) {
    return buildOpenOpeningBubbles({ topic, learnerName: opts?.learnerName });
  }
  const bank =
    opts?.bank ??
    resolveFreeGoalBank({
      topic,
      lessonDay: opts?.lessonDay,
    });
  const first = bank?.goals[0];
  if (first?.seed_tl) {
    const tl = composeOpeningBubbleTl({
      opening_tl: topic.opening_tl,
      share_tl: first.seed_tl,
      ask_tl: '',
      name: opts?.learnerName,
    });
    const ar = composeOpeningBubbleAr({
      opening_ar: topic.opening_ar,
      share_ar: first.seed_ar ?? '',
      ask_ar: '',
      name: opts?.learnerName,
    });
    return {
      character: { tl, ar },
      coach_intros: topic.intro_eg
        ? [{ item_id: topic.id, coach_intro_eg: topic.intro_eg }]
        : [],
      card_ids: [],
    };
  }
  // Legacy fallback if no goal bank.
  const doc = loadThreadTopic(topic.id);
  const line = openingNextLine(doc);
  const tl = composeOpeningBubbleTl({
    opening_tl: topic.opening_tl,
    share_tl: line.share_tl ?? '',
    ask_tl: line.tl,
    name: opts?.learnerName,
  });
  const ar = composeOpeningBubbleAr({
    opening_ar: topic.opening_ar,
    share_ar: line.share_ar ?? '',
    ask_ar: line.ar,
    name: opts?.learnerName,
  });
  return {
    character: { tl, ar },
    coach_intros: topic.intro_eg
      ? [{ item_id: topic.id, coach_intro_eg: topic.intro_eg }]
      : [],
    card_ids: [],
  };
}

/** Resolve the goal bank for a free session (topic threads or lesson day). */
export function resolveFreeGoalBank(opts: {
  topic: FreeTopic;
  lessonDay?: number | null;
  timeOfDay?: ConvoSceneTimeOfDay;
}): ConvoGoalBank | null {
  const day = opts.lessonDay;
  if (typeof day === 'number' && day > 0) {
    return loadGoalsForDay(day, { timeOfDay: opts.timeOfDay ?? 'morning' });
  }
  if (isOpenTopicId(opts.topic.id)) {
    return null;
  }
  return loadGoalsForTopic(opts.topic.id);
}

export function createFreeConvoSessionDoc(opts: {
  id: string;
  userId: string;
  topic: FreeTopic;
  suggestedWords?: string[];
  /** Lesson day for goal-directed free talk (v3). */
  lessonDay?: number | null;
  timeOfDay?: ConvoSceneTimeOfDay;
  now?: Date;
}): ConvoSession {
  const now = (opts.now ?? new Date()).toISOString();
  const bank = resolveFreeGoalBank({
    topic: opts.topic,
    lessonDay: opts.lessonDay,
    timeOfDay: opts.timeOfDay,
  });
  const goals = bank ? goalStatesFromBank(bank) : [];
  const current_goal = firstOpenGoalId(goals);
  const currentDef = bank?.goals.find((g) => g.id === current_goal);
  const scene = bank?.scene
    ? {
        ...bank.scene,
        character_id: bank.scene.character_id || opts.topic.character_id,
      }
    : {
        character_id: opts.topic.character_id,
        time_of_day: opts.timeOfDay ?? ('morning' as const),
      };
  const lesson_day =
    typeof opts.lessonDay === 'number' && opts.lessonDay > 0
      ? opts.lessonDay
      : null;

  if (isOpenTopicId(opts.topic.id) && !bank) {
    const lineId = 'open.opening';
    return {
      id: opts.id,
      user_id: opts.userId,
      module: 'free',
      pack_id: freePackId(opts.topic.id),
      topic_id: opts.topic.id,
      character_id: opts.topic.character_id,
      thread_index: 0,
      free_step: { kind: 'open' },
      threads_done: [],
      last_line_id: lineId,
      goals: [],
      current_goal: null,
      turns_on_goal: 0,
      scene,
      lesson_day,
      assisted: false,
      off_topic_streak: 0,
      paused_for_pack_id: null,
      rungs: {},
      help_ladder: { question_id: null, step: 0, attempts: 0 },
      current_group: 1,
      candidate_history: [],
      last_exchanges: [],
      pending_question: {
        id: lineId,
        kind: 'open',
        item_id: lineId,
      },
      pending_frame: openModeOpeningFrame(),
      facts: [],
      suggested_words: (opts.suggestedWords ?? [])
        .slice(0, 15)
        .map((w) => w.trim())
        .filter(Boolean),
      status: 'open',
      phase: 'teaching',
      correct_streak: 0,
      struggled: {},
      said_once: {},
      coach_recent_ids: [],
      recap_done_ids: [],
      survival_used: 0,
      learner_lines: [],
      recasts: [],
      learn_suggest_group: null,
      learn_suggest_count: 0,
      learn_suggest_done: false,
      pending_cta: null,
      coach_phrase: null,
      open_turns: 0,
      open_fallbacks: 0,
      created_at: now,
      updated_at: now,
    };
  }

  const lineId = current_goal ?? 'goal.opening';
  const fromBankWords = bank?.suggested_words ?? [];
  const suggested = (
    opts.suggestedWords ??
    (fromBankWords.length ? fromBankWords : opts.topic.word_set)
  )
    .slice(0, 15)
    .map((w) => w.trim())
    .filter(Boolean);

  return {
    id: opts.id,
    user_id: opts.userId,
    module: 'free',
    pack_id: freePackId(opts.topic.id),
    topic_id: opts.topic.id,
    character_id: scene.character_id || opts.topic.character_id,
    thread_index: 0,
    free_step: { kind: 'open' },
    threads_done: [],
    last_line_id: lineId,
    goals,
    current_goal,
    turns_on_goal: 0,
    scene,
    lesson_day,
    assisted: false,
    off_topic_streak: 0,
    paused_for_pack_id: null,
    rungs: {},
    help_ladder: { question_id: null, step: 0, attempts: 0 },
    current_group: 1,
    candidate_history: [],
    last_exchanges: [],
    pending_question: {
      id: lineId,
      kind: 'open',
      item_id: lineId,
    },
    pending_frame: pendingFrameFromGoal(currentDef) ?? openModeOpeningFrame(),
    facts: [],
    suggested_words: suggested,
    status: 'open',
    phase: 'teaching',
    correct_streak: 0,
    struggled: {},
    said_once: {},
    coach_recent_ids: [],
    recap_done_ids: [],
    survival_used: 0,
    learner_lines: [],
    recasts: [],
    learn_suggest_group: null,
    learn_suggest_count: 0,
    learn_suggest_done: false,
    pending_cta: null,
    coach_phrase: null,
    open_turns: 0,
    open_fallbacks: 0,
    created_at: now,
    updated_at: now,
  };
}
