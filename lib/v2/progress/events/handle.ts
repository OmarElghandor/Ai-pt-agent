import {
  MAX_ACTIVE_MINUTES_PER_EVENT,
  type ProgressEvent,
} from '@/lib/v2/progress/events/types';
import {
  createEmptyLesson,
  type ActivityDayRecord,
  type LessonProgressRecord,
  type ProgressStore,
} from '@/lib/v2/progress/events/store';
import {
  nextLocalDate,
  resolveLearnerTimezone,
  userLocalDate,
} from '@/lib/v2/progress/userLocalDate';

export type HandleProgressEventOpts = {
  userId: string;
  timezone?: string | null;
  now?: Date;
  store: ProgressStore;
  /** Optional hook when streak-eligible activity first lands (P11). */
  onStreakActivity?: (args: {
    userId: string;
    localDate: string;
    timezone: string;
  }) => Promise<void>;
};

export type HandleProgressEventResult = {
  duplicate: boolean;
  local_date: string;
  lesson?: LessonProgressRecord;
  next_day?: LessonProgressRecord | null;
  deck?: unknown;
  activity?: ActivityDayRecord;
};

async function bumpActivity(
  store: ProgressStore,
  userId: string,
  localDate: string,
  patch: Partial<ActivityDayRecord> & { markStreak?: boolean },
): Promise<ActivityDayRecord> {
  const existing = (await store.getActivity(userId, localDate)) ?? {
    user_id: userId,
    local_date: localDate,
    minutes: 0,
    lesson_steps_done: 0,
    cards_rated: 0,
    conversation_turns: 0,
    questions_answered: 0,
    counts_for_streak: false,
  };
  const next: ActivityDayRecord = {
    ...existing,
    minutes: existing.minutes + (patch.minutes ?? 0),
    lesson_steps_done:
      existing.lesson_steps_done + (patch.lesson_steps_done ?? 0),
    cards_rated: existing.cards_rated + (patch.cards_rated ?? 0),
    conversation_turns:
      existing.conversation_turns + (patch.conversation_turns ?? 0),
    questions_answered:
      existing.questions_answered + (patch.questions_answered ?? 0),
    counts_for_streak:
      existing.counts_for_streak || Boolean(patch.markStreak),
  };
  return store.upsertActivity(next);
}

async function ensureLesson(
  store: ProgressStore,
  userId: string,
  targetLang: string,
  day: number,
): Promise<LessonProgressRecord> {
  const existing = await store.getLesson(userId, targetLang, day);
  if (existing) return existing;
  return store.upsertLesson(
    createEmptyLesson({ user_id: userId, target_lang: targetLang, day }),
  );
}

/**
 * Promote scheduled days whose opens_on <= today to available.
 */
export async function promoteScheduledDays(
  store: ProgressStore,
  userId: string,
  targetLang: string,
  today: string,
  days: number[],
): Promise<void> {
  for (const day of days) {
    const doc = await store.getLesson(userId, targetLang, day);
    if (!doc) continue;
    if (doc.status === 'scheduled' && doc.opens_on && doc.opens_on <= today) {
      doc.status = 'available';
      doc.opens_on = null;
      await store.upsertLesson(doc);
    }
  }
}

function maybeCompleteFromQuestions(
  lesson: LessonProgressRecord,
  now: Date,
): boolean {
  if (lesson.status === 'completed') return false;
  const total = lesson.day_questions.total;
  if (total <= 0) return false;
  if (lesson.day_questions.answered < total) return false;
  lesson.status = 'completed';
  lesson.completed_at = now;
  lesson.times_completed = (lesson.times_completed ?? 0) + 1;
  lesson.resume = null;
  return true;
}

async function scheduleNextDay(
  store: ProgressStore,
  lesson: LessonProgressRecord,
  timezone: string,
  today: string,
): Promise<LessonProgressRecord> {
  const nextDay = lesson.day + 1;
  let next =
    (await store.getLesson(lesson.user_id, lesson.target_lang, nextDay)) ??
    createEmptyLesson({
      user_id: lesson.user_id,
      target_lang: lesson.target_lang,
      day: nextDay,
      status: 'locked',
    });
  if (next.status === 'locked' || next.status === 'scheduled') {
    next.status = 'scheduled';
    next.opens_on = nextLocalDate(today, timezone);
    // Never open same day.
    if (next.opens_on <= today) {
      next.opens_on = nextLocalDate(today, timezone);
    }
  }
  return store.upsertLesson(next);
}

export async function handleProgressEvent(
  event: ProgressEvent,
  opts: HandleProgressEventOpts,
): Promise<HandleProgressEventResult> {
  const now = opts.now ?? new Date();
  const timezone = resolveLearnerTimezone(opts.timezone);
  const localDate = userLocalDate(timezone, now);
  const { store, userId } = opts;

  const prior = await store.getIdempotency(userId, event.event_id);
  if (prior) {
    return {
      duplicate: true,
      local_date: localDate,
      ...(prior.result as object),
    };
  }

  let lesson: LessonProgressRecord | undefined;
  let nextDay: LessonProgressRecord | null | undefined;
  let deck: unknown;
  let activity: ActivityDayRecord | undefined;
  let markStreak = false;

  switch (event.kind) {
    case 'lesson_opened': {
      lesson = await ensureLesson(
        store,
        userId,
        event.target_lang,
        event.day,
      );
      if (lesson.status === 'scheduled' && lesson.opens_on && lesson.opens_on <= localDate) {
        lesson.status = 'available';
        lesson.opens_on = null;
      }
      if (lesson.status === 'locked') {
        // Day 1 safety; otherwise leave locked.
        if (event.day === 1) lesson.status = 'available';
      }
      if (
        lesson.status === 'available' ||
        lesson.status === 'in_progress' ||
        lesson.status === 'completed'
      ) {
        if (lesson.status === 'available') lesson.status = 'in_progress';
        lesson.last_opened_at = now;
        if (!lesson.started_at) lesson.started_at = now;
        if (event.lesson_version != null) {
          lesson.lesson_version = event.lesson_version;
        }
        if (event.steps?.length) {
          const byId = new Map(lesson.steps.map((s) => [s.id, s]));
          lesson.steps = event.steps.map((s) => {
            const prev = byId.get(s.id);
            if (prev?.status === 'done') return prev;
            return {
              id: s.id,
              status: s.present ? (prev?.status ?? 'not_started') : 'skipped',
              done_at: prev?.done_at ?? null,
            };
          });
        }
        if (event.day_questions_total != null) {
          lesson.day_questions.total = event.day_questions_total;
        }
      }
      lesson = await store.upsertLesson(lesson);
      break;
    }
    case 'step_done': {
      lesson = await ensureLesson(
        store,
        userId,
        event.target_lang,
        event.day,
      );
      if (lesson.status === 'completed') {
        // Replay: update resume/steps without touching completed_at.
      } else if (lesson.status === 'available' || lesson.status === 'locked') {
        lesson.status = 'in_progress';
        if (!lesson.started_at) lesson.started_at = now;
      }
      const idx = lesson.steps.findIndex((s) => s.id === event.step_id);
      if (idx >= 0) {
        lesson.steps[idx] = {
          ...lesson.steps[idx]!,
          status: 'done',
          done_at: now,
        };
      } else {
        lesson.steps.push({
          id: event.step_id,
          status: 'done',
          done_at: now,
        });
      }
      if (event.resume) lesson.resume = event.resume;
      else lesson.resume = { step_id: event.step_id };
      lesson.last_opened_at = now;
      lesson = await store.upsertLesson(lesson);
      activity = await bumpActivity(store, userId, localDate, {
        lesson_steps_done: 1,
        markStreak: true,
      });
      markStreak = true;
      break;
    }
    case 'day_question_answered': {
      lesson = await ensureLesson(
        store,
        userId,
        event.target_lang,
        event.day,
      );
      if (event.total != null) lesson.day_questions.total = event.total;
      if (event.answered_count != null) {
        lesson.day_questions.answered = Math.max(
          lesson.day_questions.answered,
          event.answered_count,
        );
      } else {
        lesson.day_questions.answered += 1;
      }
      if (event.first_try_correct) {
        lesson.day_questions.first_try_correct += 1;
        if (event.skill) {
          lesson.day_questions.per_skill[event.skill] =
            (lesson.day_questions.per_skill[event.skill] ?? 0) + 1;
        }
      }
      const newlyCompleted = maybeCompleteFromQuestions(lesson, now);
      lesson = await store.upsertLesson(lesson);
      if (newlyCompleted) {
        nextDay = await scheduleNextDay(store, lesson, timezone, localDate);
      }
      activity = await bumpActivity(store, userId, localDate, {
        questions_answered: 1,
        markStreak: true,
      });
      markStreak = true;
      break;
    }
    case 'lesson_finished': {
      lesson = await ensureLesson(
        store,
        userId,
        event.target_lang,
        event.day,
      );
      // Force-complete only if questions already satisfied, or total is 0
      // (caller may send after last question; prefer day_question_answered).
      if (lesson.status !== 'completed') {
        if (
          lesson.day_questions.total > 0 &&
          lesson.day_questions.answered >= lesson.day_questions.total
        ) {
          maybeCompleteFromQuestions(lesson, now);
          lesson = await store.upsertLesson(lesson);
          nextDay = await scheduleNextDay(store, lesson, timezone, localDate);
        }
      } else {
        // Replay finish: bump times_completed only via questions path; leave completed_at.
      }
      break;
    }
    case 'deck_opened': {
      const date = event.local_date ?? localDate;
      const existing = await store.getDeck(userId, date);
      if (existing) {
        deck = existing;
      } else if (event.cards?.length) {
        deck = await store.upsertDeck({
          user_id: userId,
          local_date: date,
          cards: event.cards.map((c) => ({
            item_id: c.item_id,
            slot: c.slot,
          })),
          status: 'open',
          built_at: now,
          done_at: null,
        });
      } else {
        deck = null;
      }
      break;
    }
    case 'card_rated': {
      const date = event.local_date ?? localDate;
      let d = await store.getDeck(userId, date);
      if (d) {
        const card = d.cards.find((c) => c.item_id === event.item_id);
        if (card && !card.rating) {
          card.rating = event.rating;
          card.hint = event.hint;
          card.rated_at = now;
        }
        const allRated =
          d.cards.length > 0 && d.cards.every((c) => Boolean(c.rating));
        if (allRated) {
          d.status = 'done';
          d.done_at = now;
          markStreak = true;
        }
        deck = await store.upsertDeck(d);
      }
      activity = await bumpActivity(store, userId, localDate, {
        cards_rated: 1,
        markStreak,
      });
      break;
    }
    case 'problem_session_finished': {
      activity = await bumpActivity(store, userId, localDate, {
        questions_answered: event.questions_answered,
        markStreak: true,
      });
      markStreak = true;
      break;
    }
    case 'convo_finished': {
      if (event.day != null) {
        lesson = await ensureLesson(
          store,
          userId,
          event.target_lang,
          event.day,
        );
        lesson.practice.times += 1;
        lesson.practice.last_at = now;
        lesson.practice.said = event.said;
        lesson.practice.understood = event.understood;
        lesson.practice.best_said = Math.max(
          lesson.practice.best_said,
          event.said,
        );
        lesson = await store.upsertLesson(lesson);
      }
      const turns = event.learner_turns;
      activity = await bumpActivity(store, userId, localDate, {
        conversation_turns: turns,
        markStreak: turns >= 5,
      });
      markStreak = turns >= 5;
      break;
    }
    case 'active_minutes': {
      const mins = Math.min(event.minutes, MAX_ACTIVE_MINUTES_PER_EVENT);
      if (event.day != null) {
        lesson = await ensureLesson(
          store,
          userId,
          event.target_lang,
          event.day,
        );
        lesson.minutes += mins;
        lesson = await store.upsertLesson(lesson);
      }
      activity = await bumpActivity(store, userId, localDate, {
        minutes: mins,
      });
      break;
    }
    default: {
      const _exhaustive: never = event;
      void _exhaustive;
    }
  }

  const resultPayload = {
    lesson,
    next_day: nextDay,
    deck,
    activity,
  };

  await store.saveIdempotency(userId, event.event_id, event.kind, resultPayload);

  if (markStreak && opts.onStreakActivity) {
    await opts.onStreakActivity({ userId, localDate, timezone });
  }

  return {
    duplicate: false,
    local_date: localDate,
    ...resultPayload,
  };
}
