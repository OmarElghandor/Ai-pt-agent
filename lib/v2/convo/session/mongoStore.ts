import { connectMongo } from '@/lib/mongo';
import { V2ConvoSessionModel } from '@/lib/v2/mongo/models';
import type { ConvoSessionStore } from './store';
import type { ConvoSession } from './types';

function fromDoc(doc: {
  _id: { toString(): string };
  user_id: string;
  module: ConvoSession['module'];
  pack_id: string;
  rungs: ConvoSession['rungs'];
  help_ladder: ConvoSession['help_ladder'];
  current_group: number;
  candidate_history: string[];
  last_exchanges: ConvoSession['last_exchanges'];
  pending_question: ConvoSession['pending_question'];
  facts: string[];
  suggested_words: string[];
  status: ConvoSession['status'];
  createdAt?: Date;
  updatedAt?: Date;
}): ConvoSession {
  return {
    id: String(doc._id),
    user_id: doc.user_id,
    module: doc.module,
    pack_id: doc.pack_id,
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
    facts: doc.facts ?? [],
    suggested_words: doc.suggested_words ?? [],
    status: doc.status,
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
    return fromDoc(doc as Parameters<typeof fromDoc>[0]);
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
    return fromDoc(doc as Parameters<typeof fromDoc>[0]);
  }

  async create(session: ConvoSession): Promise<ConvoSession> {
    await connectMongo();
    const created = await V2ConvoSessionModel().create({
      _id: session.id,
      user_id: session.user_id,
      module: session.module,
      pack_id: session.pack_id,
      rungs: session.rungs,
      help_ladder: session.help_ladder,
      current_group: session.current_group,
      candidate_history: session.candidate_history,
      last_exchanges: session.last_exchanges,
      pending_question: session.pending_question,
      facts: session.facts,
      suggested_words: session.suggested_words,
      status: session.status,
    });
    return fromDoc(created.toObject() as Parameters<typeof fromDoc>[0]);
  }

  async save(session: ConvoSession): Promise<ConvoSession> {
    await connectMongo();
    const doc = await V2ConvoSessionModel().findByIdAndUpdate(
      session.id,
      {
        rungs: session.rungs,
        help_ladder: session.help_ladder,
        current_group: session.current_group,
        candidate_history: session.candidate_history,
        last_exchanges: session.last_exchanges,
        pending_question: session.pending_question,
        facts: session.facts,
        suggested_words: session.suggested_words,
        status: session.status,
      },
      { new: true },
    );
    if (!doc) throw new Error(`convo session ${session.id} not found`);
    return fromDoc(doc.toObject() as Parameters<typeof fromDoc>[0]);
  }
}
