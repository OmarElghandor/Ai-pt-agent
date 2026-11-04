import type { FreeTopic } from '@/lib/v2/convo/topics';
import { loadThreadTopic } from '@/lib/v2/convo/topics';
import { openingNextLine } from '@/lib/v2/convo/free/nextLine';
import type { ConvoOpeningBubbles, ConvoSession } from './types';

/** Synthetic pack_id for free-chat sessions (store uniqueness). */
export function freePackId(topicId: string): string {
  return `free.${topicId}`;
}

export function buildFreeOpeningBubbles(
  topic: FreeTopic,
): ConvoOpeningBubbles {
  const doc = loadThreadTopic(topic.id);
  const line = openingNextLine(doc);
  // C3 fills opening_tl + name; until then character shows share+ask.
  return {
    character: { tl: line.bubble_tl },
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
    created_at: now,
    updated_at: now,
  };
}
