import {
  V2ActivityDayModel,
  V2CardDeckModel,
  V2LessonProgressModel,
  V2ProgressEventIdempotencyModel,
} from '@/lib/v2/mongo/models';

export type LessonProgressRecord = {
  user_id: string;
  target_lang: string;
  day: number;
  status: 'locked' | 'scheduled' | 'available' | 'in_progress' | 'completed';
  opens_on: string | null;
  lesson_version: number | null;
  steps: Array<{
    id: string;
    status: 'not_started' | 'done' | 'skipped';
    done_at: Date | null;
  }>;
  resume: {
    step_id: string;
    page_index?: number;
    item_index?: number;
  } | null;
  day_questions: {
    total: number;
    answered: number;
    first_try_correct: number;
    per_skill: Record<string, number>;
  };
  practice: {
    times: number;
    last_at: Date | null;
    said: number;
    understood: number;
    best_said: number;
  };
  started_at: Date | null;
  completed_at: Date | null;
  last_opened_at: Date | null;
  times_completed: number;
  minutes: number;
};

export type ActivityDayRecord = {
  user_id: string;
  local_date: string;
  minutes: number;
  lesson_steps_done: number;
  cards_rated: number;
  conversation_turns: number;
  questions_answered: number;
  counts_for_streak: boolean;
};

export type CardDeckRecord = {
  user_id: string;
  local_date: string;
  cards: Array<{
    item_id: string;
    slot: 'recent' | 'weak' | 'older';
    rating?: 'again' | 'hard' | 'easy' | 'know';
    hint?: boolean;
    rated_at?: Date;
  }>;
  status: 'open' | 'done';
  built_at: Date;
  done_at: Date | null;
};

export type ProgressStore = {
  getIdempotency(
    userId: string,
    eventId: string,
  ): Promise<{ result: unknown } | null>;
  saveIdempotency(
    userId: string,
    eventId: string,
    kind: string,
    result: unknown,
  ): Promise<void>;
  getLesson(
    userId: string,
    targetLang: string,
    day: number,
  ): Promise<LessonProgressRecord | null>;
  upsertLesson(doc: LessonProgressRecord): Promise<LessonProgressRecord>;
  getActivity(
    userId: string,
    localDate: string,
  ): Promise<ActivityDayRecord | null>;
  upsertActivity(doc: ActivityDayRecord): Promise<ActivityDayRecord>;
  getDeck(userId: string, localDate: string): Promise<CardDeckRecord | null>;
  upsertDeck(doc: CardDeckRecord): Promise<CardDeckRecord>;
};

function emptyPractice(): LessonProgressRecord['practice'] {
  return {
    times: 0,
    last_at: null,
    said: 0,
    understood: 0,
    best_said: 0,
  };
}

export function createEmptyLesson(opts: {
  user_id: string;
  target_lang: string;
  day: number;
  status?: LessonProgressRecord['status'];
}): LessonProgressRecord {
  return {
    user_id: opts.user_id,
    target_lang: opts.target_lang,
    day: opts.day,
    status: opts.status ?? (opts.day === 1 ? 'available' : 'locked'),
    opens_on: null,
    lesson_version: null,
    steps: [],
    resume: null,
    day_questions: {
      total: 0,
      answered: 0,
      first_try_correct: 0,
      per_skill: {},
    },
    practice: emptyPractice(),
    started_at: null,
    completed_at: null,
    last_opened_at: null,
    times_completed: 0,
    minutes: 0,
  };
}

export function createMemoryProgressStore(): ProgressStore {
  const idem = new Map<string, { result: unknown; kind: string }>();
  const lessons = new Map<string, LessonProgressRecord>();
  const activity = new Map<string, ActivityDayRecord>();
  const decks = new Map<string, CardDeckRecord>();

  const lessonKey = (u: string, lang: string, day: number) =>
    `${u}|${lang}|${day}`;
  const actKey = (u: string, d: string) => `${u}|${d}`;

  return {
    async getIdempotency(userId, eventId) {
      const hit = idem.get(`${userId}|${eventId}`);
      return hit ? { result: hit.result } : null;
    },
    async saveIdempotency(userId, eventId, kind, result) {
      idem.set(`${userId}|${eventId}`, { kind, result });
    },
    async getLesson(userId, targetLang, day) {
      return lessons.get(lessonKey(userId, targetLang, day)) ?? null;
    },
    async upsertLesson(doc) {
      const copy = structuredClone(doc);
      lessons.set(lessonKey(doc.user_id, doc.target_lang, doc.day), copy);
      return copy;
    },
    async getActivity(userId, localDate) {
      return activity.get(actKey(userId, localDate)) ?? null;
    },
    async upsertActivity(doc) {
      const copy = structuredClone(doc);
      activity.set(actKey(doc.user_id, doc.local_date), copy);
      return copy;
    },
    async getDeck(userId, localDate) {
      return decks.get(actKey(userId, localDate)) ?? null;
    },
    async upsertDeck(doc) {
      const copy = structuredClone(doc);
      decks.set(actKey(doc.user_id, doc.local_date), copy);
      return copy;
    },
  };
}

function fromLessonDoc(raw: Record<string, unknown>): LessonProgressRecord {
  const practice = (raw.practice as LessonProgressRecord['practice']) ?? emptyPractice();
  const dq = (raw.day_questions as LessonProgressRecord['day_questions']) ?? {
    total: 0,
    answered: 0,
    first_try_correct: 0,
    per_skill: {},
  };
  return {
    user_id: String(raw.user_id),
    target_lang: String(raw.target_lang ?? 'pt-PT'),
    day: Number(raw.day),
    status: raw.status as LessonProgressRecord['status'],
    opens_on: (raw.opens_on as string | null) ?? null,
    lesson_version: (raw.lesson_version as number | null) ?? null,
    steps: Array.isArray(raw.steps)
      ? (raw.steps as LessonProgressRecord['steps'])
      : [],
    resume: (raw.resume as LessonProgressRecord['resume']) ?? null,
    day_questions: {
      total: dq.total ?? 0,
      answered: dq.answered ?? 0,
      first_try_correct: dq.first_try_correct ?? 0,
      per_skill: { ...(dq.per_skill ?? {}) },
    },
    practice: {
      times: practice.times ?? 0,
      last_at: practice.last_at ?? null,
      said: practice.said ?? 0,
      understood: practice.understood ?? 0,
      best_said: practice.best_said ?? 0,
    },
    started_at: (raw.started_at as Date | null) ?? null,
    completed_at: (raw.completed_at as Date | null) ?? null,
    last_opened_at: (raw.last_opened_at as Date | null) ?? null,
    times_completed: Number(raw.times_completed ?? 0),
    minutes: Number(raw.minutes ?? 0),
  };
}

export function createMongoProgressStore(): ProgressStore {
  return {
    async getIdempotency(userId, eventId) {
      const doc = await V2ProgressEventIdempotencyModel()
        .findOne({ user_id: userId, event_id: eventId })
        .lean();
      if (!doc) return null;
      return { result: doc.result ?? null };
    },
    async saveIdempotency(userId, eventId, kind, result) {
      try {
        await V2ProgressEventIdempotencyModel().create({
          user_id: userId,
          event_id: eventId,
          kind,
          result,
        });
      } catch (err: unknown) {
        const code = (err as { code?: number })?.code;
        if (code !== 11000) throw err;
      }
    },
    async getLesson(userId, targetLang, day) {
      const doc = await V2LessonProgressModel()
        .findOne({ user_id: userId, target_lang: targetLang, day })
        .lean();
      return doc ? fromLessonDoc(doc as unknown as Record<string, unknown>) : null;
    },
    async upsertLesson(doc) {
      const updated = await V2LessonProgressModel()
        .findOneAndUpdate(
          {
            user_id: doc.user_id,
            target_lang: doc.target_lang,
            day: doc.day,
          },
          { $set: doc },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        )
        .lean();
      return fromLessonDoc(updated as unknown as Record<string, unknown>);
    },
    async getActivity(userId, localDate) {
      const doc = await V2ActivityDayModel()
        .findOne({ user_id: userId, local_date: localDate })
        .lean();
      if (!doc) return null;
      return {
        user_id: doc.user_id,
        local_date: doc.local_date,
        minutes: doc.minutes,
        lesson_steps_done: doc.lesson_steps_done,
        cards_rated: doc.cards_rated,
        conversation_turns: doc.conversation_turns,
        questions_answered: doc.questions_answered,
        counts_for_streak: doc.counts_for_streak,
      };
    },
    async upsertActivity(rec) {
      const updated = await V2ActivityDayModel()
        .findOneAndUpdate(
          { user_id: rec.user_id, local_date: rec.local_date },
          { $set: rec },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        )
        .lean();
      return {
        user_id: updated!.user_id,
        local_date: updated!.local_date,
        minutes: updated!.minutes,
        lesson_steps_done: updated!.lesson_steps_done,
        cards_rated: updated!.cards_rated,
        conversation_turns: updated!.conversation_turns,
        questions_answered: updated!.questions_answered,
        counts_for_streak: updated!.counts_for_streak,
      };
    },
    async getDeck(userId, localDate) {
      const doc = await V2CardDeckModel()
        .findOne({ user_id: userId, local_date: localDate })
        .lean();
      if (!doc) return null;
      return {
        user_id: doc.user_id,
        local_date: doc.local_date,
        cards: (doc.cards ?? []).map((c) => ({
          item_id: c.item_id,
          slot: c.slot as CardDeckRecord['cards'][number]['slot'],
          rating: c.rating as CardDeckRecord['cards'][number]['rating'],
          hint: c.hint ?? undefined,
          rated_at: c.rated_at ?? undefined,
        })),
        status: doc.status as 'open' | 'done',
        built_at: doc.built_at,
        done_at: doc.done_at ?? null,
      };
    },
    async upsertDeck(rec) {
      const updated = await V2CardDeckModel()
        .findOneAndUpdate(
          { user_id: rec.user_id, local_date: rec.local_date },
          { $set: rec },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        )
        .lean();
      return {
        user_id: updated!.user_id,
        local_date: updated!.local_date,
        cards: (updated!.cards ?? []).map((c) => ({
          item_id: c.item_id,
          slot: c.slot as CardDeckRecord['cards'][number]['slot'],
          rating: c.rating as CardDeckRecord['cards'][number]['rating'],
          hint: c.hint ?? undefined,
          rated_at: c.rated_at ?? undefined,
        })),
        status: updated!.status as 'open' | 'done',
        built_at: updated!.built_at,
        done_at: updated!.done_at ?? null,
      };
    },
  };
}
