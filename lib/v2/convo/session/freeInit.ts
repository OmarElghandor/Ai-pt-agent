import type { FreeTopic, TopicAngle } from '@/lib/v2/convo/topics';
import type { ConvoOpeningBubbles, ConvoSession } from './types';

/** Synthetic pack_id for free-chat sessions (store uniqueness). */
export function freePackId(topicId: string): string {
  return `free.${topicId}`;
}

export function freeOpeningLine(topic: FreeTopic): string {
  return `Olá! Vamos falar de ${topic.title_tl}?`;
}

export function buildFreeOpeningBubbles(
  topic: FreeTopic,
  firstAngle: TopicAngle | null,
): ConvoOpeningBubbles {
  return {
    character: { tl: freeOpeningLine(topic) },
    coach_intros: [],
    card_ids: [],
    ...(firstAngle
      ? {
          // First angle is emitted as pending question on start; keep cards empty.
        }
      : {}),
  };
}

export function createFreeConvoSessionDoc(opts: {
  id: string;
  userId: string;
  topic: FreeTopic;
  angles: TopicAngle[];
  suggestedWords?: string[];
  now?: Date;
}): ConvoSession {
  const now = (opts.now ?? new Date()).toISOString();
  const first = opts.angles[0] ?? null;
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
    angle_index: 0,
    angles_done: [],
    off_topic_streak: 0,
    paused_for_pack_id: null,
    rungs: {},
    help_ladder: { question_id: null, step: 0, attempts: 0 },
    current_group: 1,
    candidate_history: [],
    last_exchanges: [],
    pending_question: first
      ? { id: first.id, kind: 'open', item_id: first.id }
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
    created_at: now,
    updated_at: now,
  };
}
