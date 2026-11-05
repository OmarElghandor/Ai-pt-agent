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

/** Default open-mode answer frame (also stored as pending_frame). */
export function openModeOpeningFrame(): {
  tl: string;
  eg: string;
  chips: string[];
} {
  return {
    tl: 'Quero falar de ___.',
    eg: 'قول عايز تتكلم عن إيه',
    chips: openModeOpeningChips().slice(0, 4),
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
  opts?: { learnerName?: string | null },
): ConvoOpeningBubbles {
  if (isOpenTopicId(topic.id)) {
    return buildOpenOpeningBubbles({ topic, learnerName: opts?.learnerName });
  }
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

export function createFreeConvoSessionDoc(opts: {
  id: string;
  userId: string;
  topic: FreeTopic;
  suggestedWords?: string[];
  now?: Date;
}): ConvoSession {
  const now = (opts.now ?? new Date()).toISOString();

  if (isOpenTopicId(opts.topic.id)) {
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
      // Opening chips live on pending_frame only; vocab comes from item state (E4).
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
      created_at: now,
      updated_at: now,
    };
  }

  const doc = loadThreadTopic(opts.topic.id);
  const first = openingNextLine(doc);
  const suggested = (opts.suggestedWords ?? opts.topic.word_set)
    .slice(0, 15)
    .map((w) => w.trim())
    .filter(Boolean);

  return {
    id: opts.id,
    user_id: opts.userId,
    module: 'free',
    pack_id: freePackId(opts.topic.id),
    topic_id: opts.topic.id,
    character_id: opts.topic.character_id,
    thread_index: 0,
    free_step: { kind: 'ask' },
    threads_done: [],
    last_line_id: first.line_id,
    assisted: false,
    off_topic_streak: 0,
    paused_for_pack_id: null,
    rungs: {},
    help_ladder: { question_id: null, step: 0, attempts: 0 },
    current_group: 1,
    candidate_history: [],
    last_exchanges: [],
    pending_question: {
      id: first.line_id,
      kind: 'open',
      item_id: first.line_id,
    },
    pending_frame: first.frame
      ? {
          tl: first.frame.tl,
          eg: first.frame.eg,
          chips: [...first.frame.chips],
        }
      : null,
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
    created_at: now,
    updated_at: now,
  };
}
