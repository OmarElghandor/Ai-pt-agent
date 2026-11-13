import { V2WeakSpotModel } from '@/lib/v2/mongo/models';
import {
  applyCorrectToWeakState,
  applyLabelToWeakState,
  emptyWeakState,
  shouldOpenWeakSpot,
  type PureWeakState,
} from '@/lib/v2/progress/weak/rules';

function fromDoc(doc: Record<string, unknown> | null): PureWeakState {
  if (!doc) return emptyWeakState();
  return {
    status: (doc.status as PureWeakState['status']) ?? 'open',
    evidenceErrorIds: ((doc.evidence as { error_ids?: string[] })?.error_ids ??
      []) as string[],
    evidenceCorrectIds: ((doc.evidence as { correct_ids?: string[] })
      ?.correct_ids ?? []) as string[],
    examples: (doc.examples as PureWeakState['examples']) ?? [],
    itemsSeen: (doc.items_seen as string[]) ?? [],
    opened_at: doc.opened_at
      ? new Date(doc.opened_at as string | Date).toISOString()
      : null,
    last_error_at: doc.last_error_at
      ? new Date(doc.last_error_at as string | Date).toISOString()
      : null,
    resolved_at: doc.resolved_at
      ? new Date(doc.resolved_at as string | Date).toISOString()
      : null,
    labelHistory: ((doc as { label_history?: PureWeakState['labelHistory'] })
      .label_history ?? []) as PureWeakState['labelHistory'],
    correctHistory: ((doc as {
      correct_history?: PureWeakState['correctHistory'];
    }).correct_history ?? []) as PureWeakState['correctHistory'],
  };
}

export async function applyWeakSpotAfterLabel(opts: {
  userId: string;
  problemId: string;
  errorId: string;
  confidence: 'low' | 'medium' | 'high';
  wrong: string;
  right: string;
  itemIds: string[];
  questionKey?: string;
}): Promise<void> {
  const existing = await V2WeakSpotModel()
    .findOne({ user_id: opts.userId, problem: opts.problemId })
    .lean();
  const state = applyLabelToWeakState(fromDoc(existing as Record<string, unknown> | null), {
    errorId: opts.errorId,
    confidence: opts.confidence,
    questionKey: opts.questionKey ?? opts.errorId,
    wrong: opts.wrong,
    right: opts.right,
    itemIds: opts.itemIds,
  });

  const openNow = shouldOpenWeakSpot(state.labelHistory);
  await V2WeakSpotModel().findOneAndUpdate(
    { user_id: opts.userId, problem: opts.problemId },
    {
      $set: {
        status: openNow ? state.status : state.opened_at ? state.status : 'open',
        evidence: {
          error_ids: state.evidenceErrorIds,
          correct_ids: state.evidenceCorrectIds,
        },
        examples: state.examples,
        items_seen: state.itemsSeen,
        opened_at: openNow
          ? state.opened_at
            ? new Date(state.opened_at)
            : new Date()
          : null,
        last_error_at: state.last_error_at
          ? new Date(state.last_error_at)
          : new Date(),
        resolved_at: state.resolved_at
          ? new Date(state.resolved_at)
          : null,
        label_history: state.labelHistory,
        correct_history: state.correctHistory,
      },
    },
    { upsert: true },
  );
}

export async function applyWeakSpotCorrect(opts: {
  userId: string;
  problemId: string;
  answerId: string;
  localDate: string;
}): Promise<void> {
  const existing = await V2WeakSpotModel()
    .findOne({ user_id: opts.userId, problem: opts.problemId })
    .lean();
  if (!existing?.opened_at) return;
  const state = applyCorrectToWeakState(
    fromDoc(existing as unknown as Record<string, unknown>),
    {
      answerId: opts.answerId,
      localDate: opts.localDate,
    },
  );
  await V2WeakSpotModel().updateOne(
    { user_id: opts.userId, problem: opts.problemId },
    {
      $set: {
        status: state.status,
        evidence: {
          error_ids: state.evidenceErrorIds,
          correct_ids: state.evidenceCorrectIds,
        },
        resolved_at: state.resolved_at
          ? new Date(state.resolved_at)
          : null,
        correct_history: state.correctHistory,
      },
    },
  );
}
