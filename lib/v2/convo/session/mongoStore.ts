import { connectMongo } from '@/lib/mongo';
import { V2ConvoSessionModel } from '@/lib/v2/mongo/models';
import { parseFreeThreadStep } from '@/lib/v2/convo/free/nextLine';
import type { ConvoSessionStore } from './store';
import type { ConvoSession } from './types';

type ConvoSessionDocLean = {
  _id: { toString(): string };
  user_id: string;
  module: ConvoSession['module'];
  pack_id: string;
  topic_id?: string | null;
  character_id?: string | null;
  thread_index?: number;
  free_step?: unknown;
  threads_done?: string[];
  last_line_id?: string | null;
  assisted?: boolean;
  /** Legacy angle fields (pre–Batch 9). */
  angle_index?: number;
  angles_done?: string[];
  off_topic_streak?: number;
  paused_for_pack_id?: string | null;
  rungs: ConvoSession['rungs'];
  help_ladder: ConvoSession['help_ladder'];
  current_group: number;
  candidate_history: string[];
  last_exchanges: ConvoSession['last_exchanges'];
  pending_question: ConvoSession['pending_question'];
  pending_frame?: ConvoSession['pending_frame'];
  facts: string[];
  suggested_words: string[];
  status: ConvoSession['status'];
  phase?: ConvoSession['phase'];
  correct_streak?: number;
  struggled?: ConvoSession['struggled'];
  said_once?: ConvoSession['said_once'];
  coach_recent_ids?: string[];
  recap_done_ids?: string[];
  survival_used?: number;
  learner_lines?: string[];
  recasts?: Array<{ original: string; corrected: string }>;
  learn_suggest_group?: string | null;
  learn_suggest_count?: number;
  learn_suggest_done?: boolean;
  pending_cta?: ConvoSession['pending_cta'];
  coach_phrase?: ConvoSession['coach_phrase'];
  open_turns?: number;
  open_fallbacks?: number;
  last_pack_reaction_tl?: string | null;
  goals?: ConvoSession['goals'];
  current_goal?: string | null;
  turns_on_goal?: number;
  scene?: ConvoSession['scene'];
  lesson_day?: number | null;
  topic_locked?: boolean;
  learner_level?: number | null;
  teaching_mode?: boolean;
  teach_shown_for?: string | null;
  goal_tier?: ConvoSession['goal_tier'];
  createdAt?: Date;
  updatedAt?: Date;
};

function sessionFields(session: ConvoSession) {
  return {
    module: session.module,
    topic_id: session.topic_id,
    character_id: session.character_id,
    thread_index: session.thread_index,
    free_step: session.free_step,
    threads_done: session.threads_done,
    last_line_id: session.last_line_id,
    assisted: session.assisted,
    off_topic_streak: session.off_topic_streak,
    paused_for_pack_id: session.paused_for_pack_id,
    rungs: session.rungs,
    help_ladder: session.help_ladder,
    current_group: session.current_group,
    candidate_history: session.candidate_history,
    last_exchanges: session.last_exchanges,
    pending_question: session.pending_question,
    pending_frame: session.pending_frame,
    facts: session.facts,
    suggested_words: session.suggested_words,
    status: session.status,
    phase: session.phase,
    correct_streak: session.correct_streak,
    struggled: session.struggled,
    said_once: session.said_once,
    coach_recent_ids: session.coach_recent_ids,
    recap_done_ids: session.recap_done_ids,
    survival_used: session.survival_used,
    learner_lines: session.learner_lines,
    recasts: session.recasts,
    learn_suggest_group: session.learn_suggest_group,
    learn_suggest_count: session.learn_suggest_count,
    learn_suggest_done: session.learn_suggest_done,
    pending_cta: session.pending_cta,
    coach_phrase: session.coach_phrase,
    open_turns: session.open_turns,
    open_fallbacks: session.open_fallbacks,
    last_pack_reaction_tl: session.last_pack_reaction_tl ?? null,
    goals: session.goals ?? [],
    current_goal: session.current_goal ?? null,
    turns_on_goal: session.turns_on_goal ?? 0,
    scene: session.scene ?? null,
    lesson_day: session.lesson_day ?? null,
    topic_locked: session.topic_locked ?? false,
    learner_level: session.learner_level ?? null,
    teaching_mode: session.teaching_mode ?? false,
    teach_shown_for: session.teach_shown_for ?? null,
    goal_tier: session.goal_tier ?? 'core',
  };
}

function fromDoc(doc: ConvoSessionDocLean): ConvoSession {
  return {
    id: String(doc._id),
    user_id: doc.user_id,
    module: doc.module,
    pack_id: doc.pack_id,
    topic_id: doc.topic_id ?? null,
    character_id: doc.character_id ?? null,
    thread_index: doc.thread_index ?? doc.angle_index ?? 0,
    free_step: parseFreeThreadStep(doc.free_step),
    threads_done: doc.threads_done ?? doc.angles_done ?? [],
    last_line_id: doc.last_line_id ?? null,
    goals: Array.isArray(doc.goals) ? doc.goals : [],
    current_goal: doc.current_goal ?? null,
    turns_on_goal: doc.turns_on_goal ?? 0,
    scene: doc.scene ?? null,
    lesson_day: doc.lesson_day ?? null,
    topic_locked: doc.topic_locked ?? false,
    learner_level: doc.learner_level ?? null,
    teaching_mode: doc.teaching_mode ?? false,
    teach_shown_for: doc.teach_shown_for ?? null,
    goal_tier: doc.goal_tier ?? 'core',
    assisted: doc.assisted ?? false,
    off_topic_streak: doc.off_topic_streak ?? 0,
    paused_for_pack_id: doc.paused_for_pack_id ?? null,
    rungs: doc.rungs ?? {},
    help_ladder: doc.help_ladder ?? {
      question_id: null,
      step: 0,
      attempts: 0,
    },
    current_group: doc.current_group ?? 1,
    candidate_history: doc.candidate_history ?? [],
    last_exchanges: doc.last_exchanges ?? [],
    pending_question: doc.pending_question ?? null,
    pending_frame: doc.pending_frame ?? null,
    facts: doc.facts ?? [],
    suggested_words: doc.suggested_words ?? [],
    status: doc.status,
    phase: doc.phase ?? 'teaching',
    correct_streak: doc.correct_streak ?? 0,
    struggled: doc.struggled ?? {},
    said_once: doc.said_once ?? {},
    coach_recent_ids: doc.coach_recent_ids ?? [],
    recap_done_ids: doc.recap_done_ids ?? [],
    survival_used: doc.survival_used ?? 0,
    learner_lines: doc.learner_lines ?? [],
    recasts: Array.isArray(doc.recasts) ? doc.recasts : [],
    learn_suggest_group: doc.learn_suggest_group ?? null,
    learn_suggest_count: doc.learn_suggest_count ?? 0,
    learn_suggest_done: doc.learn_suggest_done ?? false,
    pending_cta: doc.pending_cta ?? null,
    coach_phrase: doc.coach_phrase ?? null,
    open_turns: doc.open_turns ?? 0,
    open_fallbacks: doc.open_fallbacks ?? 0,
    last_pack_reaction_tl: doc.last_pack_reaction_tl ?? null,
    created_at: (doc.createdAt ?? new Date()).toISOString(),
    updated_at: (doc.updatedAt ?? new Date()).toISOString(),
  };
}

/** Mongo-backed store for `v2_convo_sessions`. */
export class MongoConvoSessionStore implements ConvoSessionStore {
  async findById(id: string): Promise<ConvoSession | null> {
    await connectMongo();
    const doc = await V2ConvoSessionModel().findById(id).lean();
    if (!doc) return null;
    return fromDoc(doc as ConvoSessionDocLean);
  }

  async findOpen(
    userId: string,
    packId: string,
  ): Promise<ConvoSession | null> {
    await connectMongo();
    const doc = await V2ConvoSessionModel()
      .findOne({
        user_id: userId,
        pack_id: packId,
        status: 'open',
      })
      .lean();
    if (!doc) return null;
    return fromDoc(doc as ConvoSessionDocLean);
  }

  async findOpenFreeTopicIds(userId: string): Promise<string[]> {
    await connectMongo();
    const docs = await V2ConvoSessionModel()
      .find({
        user_id: userId,
        module: 'free',
        status: 'open',
        topic_id: { $ne: null },
        // Lesson-day free talk uses free:day-N and must not light «أي حاجة».
        $or: [
          { lesson_day: null },
          { lesson_day: { $exists: false } },
          { lesson_day: { $lte: 0 } },
        ],
      })
      .select({ topic_id: 1, pack_id: 1, lesson_day: 1 })
      .lean();
    const ids: string[] = [];
    for (const d of docs) {
      const row = d as {
        topic_id?: string | null;
        pack_id?: string;
      };
      const tid = row.topic_id;
      if (!tid) continue;
      if (row.pack_id && row.pack_id.startsWith('free:day-')) continue;
      if (row.pack_id && row.pack_id !== `free.${tid}`) continue;
      ids.push(tid);
    }
    return ids;
  }

  async create(session: ConvoSession): Promise<ConvoSession> {
    await connectMongo();
    const created = await V2ConvoSessionModel().create({
      _id: session.id,
      user_id: session.user_id,
      module: session.module,
      pack_id: session.pack_id,
      ...sessionFields(session),
    });
    return fromDoc(created.toObject() as ConvoSessionDocLean);
  }

  async save(session: ConvoSession): Promise<ConvoSession> {
    await connectMongo();
    const doc = await V2ConvoSessionModel().findByIdAndUpdate(
      session.id,
      sessionFields(session),
      { new: true },
    );
    if (!doc) throw new Error(`convo session ${session.id} not found`);
    return fromDoc(doc.toObject() as ConvoSessionDocLean);
  }

  async deleteOpen(userId: string, packId: string): Promise<number> {
    await connectMongo();
    const res = await V2ConvoSessionModel().deleteMany({
      user_id: userId,
      pack_id: packId,
      status: 'open',
    });
    return res.deletedCount ?? 0;
  }
}
