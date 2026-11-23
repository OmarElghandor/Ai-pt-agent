/**
 * Backfill mastery stages on v2_item_state (16 §6 / E2).
 *
 * Prefers stage_moves from the answer log when present; otherwise infers
 * from existing item-state fields.
 *
 *   npx tsx scripts/v2/backfill-stages.ts           # dry run
 *   npx tsx scripts/v2/backfill-stages.ts --apply   # write
 */
import { connectMongo, mongoConfigured } from '../../lib/mongo';
import {
  V2AnswersModel,
  V2ItemStateModel,
} from '../../lib/v2/mongo/models';
import { inferStageFromState, type ItemState } from '../../lib/v2/progress';

type StageMove = {
  item_id: string;
  from: number;
  to: number;
  answer_id?: string;
};

function docToState(doc: Record<string, unknown>): ItemState {
  const card = (doc.card ?? {}) as Record<string, unknown>;
  return {
    user_id: String(doc.user_id),
    item_id: String(doc.item_id),
    target_lang: String(doc.target_lang ?? 'pt-PT'),
    introducedDay: Number(doc.introducedDay ?? 1),
    usedCorrectlyIn: Array.isArray(doc.usedCorrectlyIn)
      ? (doc.usedCorrectlyIn as string[])
      : [],
    levels: (doc.levels as ItemState['levels']) ?? {
      heard: 0,
      understood: 0,
      said: 0,
      used: 0,
    },
    skills: (doc.skills as ItemState['skills']) ?? {},
    card: {
      interval: Number(card.interval ?? 0),
      dueAt: null,
      masteryLevel: card.masteryLevel === 'mastered' ? 'mastered' : 'learning',
      consecutiveCorrect: Number(card.consecutiveCorrect ?? 0),
      face: String(card.face ?? 'recognize'),
      knowCheckDueAt: null,
    },
    lastImplicitReviewLocalDate: null,
    weakToolIds: [],
    stage: ([1, 2, 3, 4].includes(Number(doc.stage))
      ? Number(doc.stage)
      : undefined) as 1 | 2 | 3 | 4 | undefined,
    stage_at: (doc.stage_at as string | null) ?? null,
    stage_answer_id: (doc.stage_answer_id as string | null) ?? null,
    first_recognition_at: (doc.first_recognition_at as string | null) ?? null,
    first_recall_at: (doc.first_recall_at as string | null) ?? null,
  };
}

async function loadMovesByItem(): Promise<
  Map<string, { stage: 1 | 2 | 3 | 4; stage_at: string | null; stage_answer_id: string | null }>
> {
  const out = new Map<
    string,
    { stage: 1 | 2 | 3 | 4; stage_at: string | null; stage_answer_id: string | null }
  >();
  const cursor = V2AnswersModel()
    .find({ 'stage_moves.0': { $exists: true } })
    .sort({ createdAt: 1 })
    .lean()
    .cursor();

  for await (const doc of cursor) {
    const localDate = String(doc.local_date ?? '');
    const moves = (doc.stage_moves ?? []) as StageMove[];
    for (const move of moves) {
      if (!move?.item_id) continue;
      const to = ([1, 2, 3, 4].includes(Number(move.to))
        ? Number(move.to)
        : 1) as 1 | 2 | 3 | 4;
      const key = `${doc.user_id}::${move.item_id}`;
      out.set(key, {
        stage: to,
        stage_at: localDate || null,
        stage_answer_id:
          move.answer_id ??
          (doc.answer_id ? String(doc.answer_id) : null),
      });
    }
  }
  return out;
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (!mongoConfigured()) {
    console.error('MongoDB not configured');
    process.exit(1);
  }
  await connectMongo();

  const fromLog = await loadMovesByItem();
  const docs = await V2ItemStateModel().find({}).lean();
  let wouldUpdate = 0;
  let updated = 0;
  let fromAnswers = 0;
  let fromInfer = 0;

  for (const doc of docs) {
    const state = docToState(doc as unknown as Record<string, unknown>);
    const key = `${state.user_id}::${state.item_id}`;
    const logged = fromLog.get(key);

    let nextStage = state.stage ?? 1;
    let nextAt = state.stage_at ?? null;
    let nextAnswerId = state.stage_answer_id ?? null;
    let firstRecognition = state.first_recognition_at ?? null;
    let firstRecall = state.first_recall_at ?? null;
    let source: 'log' | 'infer' | 'skip' = 'skip';

    if (logged) {
      nextStage = logged.stage;
      nextAt = logged.stage_at;
      nextAnswerId = logged.stage_answer_id;
      if (nextStage >= 2 && !firstRecognition) firstRecognition = nextAt;
      if (nextStage >= 3 && !firstRecall) firstRecall = nextAt;
      source = 'log';
    } else if (state.stage == null || state.stage < 1) {
      const inferred = inferStageFromState(state);
      nextStage = (inferred.stage ?? 1) as 1 | 2 | 3 | 4;
      nextAt = inferred.stage_at ?? null;
      firstRecognition = inferred.first_recognition_at ?? null;
      firstRecall = inferred.first_recall_at ?? null;
      source = 'infer';
    }

    const changed =
      state.stage !== nextStage ||
      state.stage_at !== nextAt ||
      (state.stage_answer_id ?? null) !== nextAnswerId ||
      (state.first_recognition_at ?? null) !== firstRecognition ||
      (state.first_recall_at ?? null) !== firstRecall;

    if (!changed || source === 'skip') continue;

    wouldUpdate += 1;
    if (source === 'log') fromAnswers += 1;
    if (source === 'infer') fromInfer += 1;

    if (apply) {
      await V2ItemStateModel().updateOne(
        { user_id: state.user_id, item_id: state.item_id },
        {
          $set: {
            stage: nextStage,
            stage_at: nextAt,
            stage_answer_id: nextAnswerId,
            first_recognition_at: firstRecognition,
            first_recall_at: firstRecall,
          },
        },
      );
      updated += 1;
    }
  }

  console.log(
    apply
      ? `Updated ${updated} / ${docs.length} (log ${fromAnswers}, infer ${fromInfer})`
      : `Dry run: would update ${wouldUpdate} / ${docs.length} (log ${fromAnswers}, infer ${fromInfer}; pass --apply to write)`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
