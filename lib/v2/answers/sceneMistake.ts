/**
 * Role-play mistakes → answers → classify-on-2nd → weak spots (batch-rp-5).
 */
import type { SceneMistakePayload } from '@/lib/v2/answers/payload';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2ErrorModel } from '@/lib/v2/mongo/models';
import {
  ROLEPLAY_SOURCE,
  categoryForPair,
  sceneMistakeKey,
  sceneToolId,
} from './sceneMistakeHelpers';

export {
  ROLEPLAY_SOURCE,
  categoryForPair,
  diffWordPairs,
  sceneMistakeAnswerId,
  sceneMistakeKey,
  sceneToolId,
} from './sceneMistakeHelpers';

const WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export type SceneMistakeEnqueue =
  typeof import('@/lib/v2/progress/classify/enqueue').enqueueClassifyError;

export type SceneErrorDoc = {
  id: string;
  user_id: string;
  tool_id: string;
  category: string;
  scope: string;
  wrong: string;
  right: string;
  source: typeof ROLEPLAY_SOURCE;
  mistake_key: string;
  prompt_tl?: string;
  learner_tl?: string;
  corrected_tl?: string;
  at: Date;
  problem?: unknown;
};

export type SceneErrorStore = {
  insert(doc: Omit<SceneErrorDoc, 'id'>): Promise<{ id: string }>;
  listByKey(
    userId: string,
    mistakeKey: string,
    since: Date,
  ): Promise<SceneErrorDoc[]>;
};

export function createMongoSceneErrorStore(): SceneErrorStore {
  return {
    async insert(doc) {
      await connectMongo();
      const created = await V2ErrorModel().create({
        user_id: doc.user_id,
        tool_id: doc.tool_id,
        category: doc.category,
        scope: doc.scope,
        wrong: doc.wrong,
        right: doc.right,
        at: doc.at,
        source: doc.source,
        mistake_key: doc.mistake_key,
        prompt_tl: doc.prompt_tl,
        learner_tl: doc.learner_tl,
        corrected_tl: doc.corrected_tl,
      });
      return { id: String(created._id) };
    },
    async listByKey(userId, mistakeKey, since) {
      await connectMongo();
      const rows = await V2ErrorModel()
        .find({
          user_id: userId,
          source: ROLEPLAY_SOURCE,
          mistake_key: mistakeKey,
          at: { $gte: since },
        })
        .sort({ at: 1 })
        .lean();
      return rows.map((r) => ({
        id: String(r._id),
        user_id: r.user_id,
        tool_id: String(r.tool_id ?? ''),
        category: r.category,
        scope: r.scope,
        wrong: r.wrong,
        right: r.right,
        source: ROLEPLAY_SOURCE,
        mistake_key: String(
          (r as { mistake_key?: string }).mistake_key ?? mistakeKey,
        ),
        prompt_tl: (r as { prompt_tl?: string }).prompt_tl,
        learner_tl: (r as { learner_tl?: string }).learner_tl,
        corrected_tl: (r as { corrected_tl?: string }).corrected_tl,
        at: new Date(r.at),
        problem: r.problem,
      }));
    },
  };
}

export type ProcessSceneMistakeResult = {
  errorId: string;
  count: number;
  classifiedIds: string[];
};

/**
 * Write one role-play error; classify only from the 2nd occurrence in 14d.
 */
export async function processSceneMistake(opts: {
  userId: string;
  payload: SceneMistakePayload;
  now?: Date;
  localDate: string;
  store?: SceneErrorStore;
  enqueue?: SceneMistakeEnqueue;
}): Promise<ProcessSceneMistakeResult> {
  const now = opts.now ?? new Date();
  const store =
    opts.store ??
    (mongoConfigured() ? createMongoSceneErrorStore() : null);
  if (!store) {
    throw new Error('scene mistake store unavailable');
  }
  const enqueue =
    opts.enqueue ??
    (await import('@/lib/v2/progress/classify/enqueue')).enqueueClassifyError;
  const key = sceneMistakeKey(opts.payload.wrong, opts.payload.right);
  const classified = categoryForPair(opts.payload.wrong, opts.payload.right);
  const toolId = sceneToolId(opts.payload.scene_id, opts.payload.goal_id);

  const inserted = await store.insert({
    user_id: opts.userId,
    tool_id: toolId,
    category: classified.category,
    scope: classified.scope,
    wrong: opts.payload.wrong,
    right: opts.payload.right,
    source: ROLEPLAY_SOURCE,
    mistake_key: key,
    prompt_tl: opts.payload.prompt_tl,
    learner_tl: opts.payload.learner_tl,
    corrected_tl: opts.payload.corrected_tl,
    at: now,
  });

  const since = new Date(now.getTime() - WINDOW_MS);
  const recent = await store.listByKey(opts.userId, key, since);
  const count = recent.length;

  const classifiedIds: string[] = [];
  const enqueueOne = (doc: SceneErrorDoc) => {
    classifiedIds.push(doc.id);
    enqueue({
      errorId: doc.id,
      userId: opts.userId,
      learnerDay: opts.payload.day,
      localDate: opts.localDate,
      wrong: doc.learner_tl ?? opts.payload.learner_tl,
      right: doc.corrected_tl ?? opts.payload.corrected_tl,
      isBrazilian: doc.scope === 'brazilian',
      questionType: 'roleplay',
      promptText: doc.prompt_tl ?? opts.payload.prompt_tl,
      mainError: `${doc.wrong} → ${doc.right}`,
      questionKey: doc.tool_id || toolId,
      itemIds: [],
    });
  };

  if (count === 2) {
    for (const doc of recent) {
      if (!doc.problem) enqueueOne(doc);
    }
  } else if (count >= 3) {
    const self = recent.find((d) => d.id === inserted.id) ?? {
      id: inserted.id,
      user_id: opts.userId,
      tool_id: toolId,
      category: classified.category,
      scope: classified.scope,
      wrong: opts.payload.wrong,
      right: opts.payload.right,
      source: ROLEPLAY_SOURCE,
      mistake_key: key,
      prompt_tl: opts.payload.prompt_tl,
      learner_tl: opts.payload.learner_tl,
      corrected_tl: opts.payload.corrected_tl,
      at: now,
    };
    enqueueOne(self);
  }

  return { errorId: inserted.id, count, classifiedIds };
}
