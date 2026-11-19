import { randomUUID } from 'node:crypto';
import { getLangifyUserFirstName } from '@/lib/langifyRead';
import {
  freeTopicById,
  isOpenTopicId,
  loadThreadTopic,
  type FreeTopic,
} from '@/lib/v2/convo/topics';
import { currentNextLine } from '@/lib/v2/convo/free/nextLine';
import {
  ensureLessonDayGoalBank,
  healSceneSessionAgainstBank,
} from '@/lib/v2/convo/goals';
import { pickGoalAskLines } from '@/lib/v2/convo/prompt';
import { isSceneBank } from '@/lib/v2/convo/scenes';
import {
  buildFreeOpeningBubbles,
  createFreeConvoSessionDoc,
  freePackId,
  resolveFreeGoalBank,
  type LearnerGender,
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
  /** Learner gender for tl / tl_f; default m. */
  learnerGender?: LearnerGender;
};

async function resumeFree(
  existing: ConvoSession,
  topic: FreeTopic,
  store: ConvoSessionStore,
  learnerName?: string | null,
  learnerGender: LearnerGender = 'm',
): Promise<StartConvoResult> {
  const cleared =
    existing.paused_for_pack_id != null
      ? { ...existing, paused_for_pack_id: null }
      : existing;
  const lessonDay =
    typeof cleared.lesson_day === 'number' && cleared.lesson_day > 0
      ? cleared.lesson_day
      : null;
  const sceneBank = resolveFreeGoalBank({ topic, lessonDay });
  if (isSceneBank(sceneBank)) {
    let session =
      cleared !== existing ? await store.save(cleared) : cleared;
    const healed = healSceneSessionAgainstBank(
      session,
      sceneBank,
      learnerGender,
    );
    if (healed) {
      session = await store.save(session);
    }
    const opening = buildFreeOpeningBubbles(topic, {
      learnerName,
      lessonDay,
      learnerGender,
      bank: sceneBank,
    });
    // «كمّل المكالمة» replays the last character bubble.
    const lastCharTl = [...session.last_exchanges]
      .reverse()
      .find((e) => e.role === 'character')
      ?.tl?.trim();
    if (lastCharTl) {
      const current = sceneBank.goals.find(
        (g) => g.id === session.current_goal,
      );
      const ask = current
        ? pickGoalAskLines(current, learnerGender)
        : null;
      opening.character = {
        tl: lastCharTl,
        ar: ask?.ar?.trim() || opening.character.ar,
      };
    } else if (opening.character.tl?.trim()) {
      // Resumed with no history — seed opening so the first turn has context.
      session.last_exchanges = [
        { role: 'character', tl: opening.character.tl.trim() },
      ];
      session = await store.save(session);
    }
    return { session, opening, resumed: true };
  }

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
      learnerGender,
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

  // Roleplay scenes always start fresh — no mid-call resume.
  // Old-format scene sessions must never resume (batch-rp-3 G11).
  const isScene = topic.id.startsWith('cena-');
  if (isScene) {
    await opts.store.deleteOpen?.(opts.userId, packId);
  } else {
    if (opts.sessionId) {
      const existing = await opts.store.findById(opts.sessionId);
      if (
        existing &&
        existing.user_id === opts.userId &&
        existing.module === 'free' &&
        existing.topic_id === topic.id &&
        lessonDayMatches(existing)
      ) {
        const bank = resolveFreeGoalBank({
          topic,
          lessonDay: requestedDay,
        });
        if (
          isSceneBank(bank) &&
          existing.scene_format != null &&
          bank.format != null &&
          existing.scene_format !== bank.format
        ) {
          await opts.store.deleteOpen?.(opts.userId, packId);
        } else {
          return resumeFree(
            existing,
            topic,
            opts.store,
            learnerName,
            opts.learnerGender ?? 'm',
          );
        }
      }
    }

    const open = await opts.store.findOpen(opts.userId, packId);
    if (open && open.module === 'free' && lessonDayMatches(open)) {
      const bank = resolveFreeGoalBank({
        topic,
        lessonDay: requestedDay,
      });
      if (
        isSceneBank(bank) &&
        open.scene_format != null &&
        bank.format != null &&
        open.scene_format !== bank.format
      ) {
        await opts.store.deleteOpen?.(opts.userId, packId);
      } else {
        return resumeFree(
          open,
          topic,
          opts.store,
          learnerName,
          opts.learnerGender ?? 'm',
        );
      }
    }
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
  const opening = buildFreeOpeningBubbles(topic, {
    learnerName,
    lessonDay: opts.lessonDay,
    learnerGender: opts.learnerGender ?? 'm',
  });
  // Scenes: seed last character exchange so the first learner turn has context.
  if (
    created.topic_id?.startsWith('cena-') &&
    opening.character.tl?.trim()
  ) {
    created.last_exchanges = [
      { role: 'character', tl: opening.character.tl.trim() },
    ];
    if (opening.character.tl.trim()) {
      created.scene_variant_counters = {
        ...(created.scene_variant_counters ?? {}),
        opening: 1,
      };
    }
  }
  const session = await opts.store.create(created);
  return {
    session,
    opening,
    resumed: false,
  };
}
