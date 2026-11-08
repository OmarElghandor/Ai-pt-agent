import { randomUUID } from 'node:crypto';
import { getLangifyUserFirstName } from '@/lib/langifyRead';
import {
  freeTopicById,
  isOpenTopicId,
  loadThreadTopic,
  type FreeTopic,
} from '@/lib/v2/convo/topics';
import { currentNextLine } from '@/lib/v2/convo/free/nextLine';
import { ensureLessonDayGoalBank } from '@/lib/v2/convo/goals';
import {
  buildFreeOpeningBubbles,
  createFreeConvoSessionDoc,
  freePackId,
} from './freeInit';
import { buildFreeReopening } from './reopenFree';
import { loadSuggestedSurfacesForUser } from './suggestedWords';
import type { ConvoSessionStore } from './store';
import type { ConvoSession, StartConvoResult } from './types';

export type StartFreeConvoSessionOpts = {
  userId: string;
  topicId: string;
  store: ConvoSessionStore;
  sessionId?: string;
  newId?: () => string;
  now?: Date;
  topic?: FreeTopic;
  suggestedWords?: string[];
  /** Lesson day → load that day's goals (v3). */
  lessonDay?: number | null;
  /** Curriculum level for opening chips / gating (v4). */
  learnerLevel?: number | null;
  /** Injected for tests; otherwise loaded from Langify users.name. */
  learnerName?: string | null;
};

async function resumeFree(
  existing: ConvoSession,
  topic: FreeTopic,
  store: ConvoSessionStore,
  learnerName?: string | null,
): Promise<StartConvoResult> {
  const cleared =
    existing.paused_for_pack_id != null
      ? { ...existing, paused_for_pack_id: null }
      : existing;
  const lessonDay =
    typeof cleared.lesson_day === 'number' && cleared.lesson_day > 0
      ? cleared.lesson_day
      : null;
  if (
    cleared.pending_question &&
    !isOpenTopicId(topic.id) &&
    cleared.free_step.kind !== 'open' &&
    !lessonDay
  ) {
    const doc = loadThreadTopic(topic.id);
    const pending = currentNextLine(
      doc,
      cleared.thread_index,
      cleared.free_step,
      topic,
    );
    const built = buildFreeReopening(cleared, topic, pending.tl);
    const session = await store.save(built.session);
    return {
      session,
      opening: built.opening,
      resumed: true,
      reopening: built.reopening,
    };
  }
  const session =
    cleared !== existing ? await store.save(cleared) : cleared;
  return {
    session,
    opening: buildFreeOpeningBubbles(topic, {
      learnerName,
      lessonDay,
    }),
    resumed: true,
  };
}

/**
 * Create or resume a Module C free-chat session (Batch 9).
 * No model call. Opening: coach intro_eg + one bubble (opening+share+ask).
 */
export async function startFreeConvoSession(
  opts: StartFreeConvoSessionOpts,
): Promise<StartConvoResult> {
  const topic = opts.topic ?? freeTopicById(opts.topicId);
  if (!topic) throw new Error(`Unknown free topic: ${opts.topicId}`);

  const requestedDay =
    typeof opts.lessonDay === 'number' && opts.lessonDay > 0
      ? opts.lessonDay
      : null;
  const packId = freePackId(topic.id, requestedDay);
  const learnerName =
    opts.learnerName !== undefined
      ? opts.learnerName
      : await getLangifyUserFirstName(opts.userId);

  const lessonDayMatches = (session: ConvoSession): boolean => {
    const stored =
      typeof session.lesson_day === 'number' && session.lesson_day > 0
        ? session.lesson_day
        : null;
    return stored === requestedDay;
  };

  if (opts.sessionId) {
    const existing = await opts.store.findById(opts.sessionId);
    if (
      existing &&
      existing.user_id === opts.userId &&
      existing.module === 'free' &&
      existing.topic_id === topic.id &&
      lessonDayMatches(existing)
    ) {
      return resumeFree(existing, topic, opts.store, learnerName);
    }
  }

  const open = await opts.store.findOpen(opts.userId, packId);
  if (open && open.module === 'free' && lessonDayMatches(open)) {
    return resumeFree(open, topic, opts.store, learnerName);
  }

  // F5: hydrate generated lesson-day bank into memory/Mongo before create.
  if (requestedDay != null) {
    await ensureLessonDayGoalBank({ day: requestedDay });
  }

  const id = opts.newId?.() ?? randomUUID();
  let suggestedWords = opts.suggestedWords;
  if (
    suggestedWords === undefined &&
    isOpenTopicId(topic.id) &&
    !(typeof opts.lessonDay === 'number' && opts.lessonDay > 0)
  ) {
    suggestedWords = await loadSuggestedSurfacesForUser(opts.userId);
  }
  const created = createFreeConvoSessionDoc({
    id,
    userId: opts.userId,
    topic,
    now: opts.now,
    lessonDay: opts.lessonDay,
    learnerLevel: opts.learnerLevel,
    ...(suggestedWords ? { suggestedWords } : {}),
  });
  const session = await opts.store.create(created);
  return {
    session,
    opening: buildFreeOpeningBubbles(topic, {
      learnerName,
      lessonDay: opts.lessonDay,
    }),
    resumed: false,
  };
}
