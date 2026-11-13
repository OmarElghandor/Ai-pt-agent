/**
 * Fire-and-forget classification after answers saves a wrong/near-miss.
 * Never awaited by the answers HTTP response.
 */
import { classifyMistake } from '@/lib/v2/progress/classify/run';
import { V2ErrorModel, V2ProblemRequestModel } from '@/lib/v2/mongo/models';
import { applyWeakSpotAfterLabel } from '@/lib/v2/progress/weak/update';

const dailyCounts = new Map<string, { date: string; n: number }>();
const DAILY_CAP = 60;

function underCap(userId: string, localDate: string): boolean {
  const cur = dailyCounts.get(userId);
  if (!cur || cur.date !== localDate) {
    dailyCounts.set(userId, { date: localDate, n: 0 });
    return true;
  }
  return cur.n < DAILY_CAP;
}

function bumpCap(userId: string, localDate: string): void {
  const cur = dailyCounts.get(userId);
  if (!cur || cur.date !== localDate) {
    dailyCounts.set(userId, { date: localDate, n: 1 });
  } else {
    cur.n += 1;
  }
}

export function enqueueClassifyError(opts: {
  errorId: string;
  userId: string;
  learnerDay: number;
  localDate: string;
  wrong: string;
  right: string;
  isBrazilian?: boolean;
  isWordMixup?: boolean;
  commonMistakeProblemId?: string | null;
  questionType?: string;
  promptText?: string;
  itemIds?: string[];
  patternIds?: string[];
}): void {
  void (async () => {
    try {
      const allowModel = underCap(opts.userId, opts.localDate);
      const result = await classifyMistake({
        wrong: opts.wrong,
        right: opts.right,
        learnerDay: opts.learnerDay,
        isBrazilian: opts.isBrazilian,
        isWordMixup: opts.isWordMixup,
        commonMistakeProblemId: opts.commonMistakeProblemId,
        questionType: opts.questionType,
        promptText: opts.promptText,
        itemIds: opts.itemIds,
        patternIds: opts.patternIds,
        client: allowModel ? undefined : null,
      });
      if (result.usedModel) bumpCap(opts.userId, opts.localDate);
      if (result.cardsOnly || !result.label) return;

      await V2ErrorModel().updateOne(
        { _id: opts.errorId, problem: { $exists: false } },
        {
          $set: {
            problem: {
              id: result.label.id,
              by: result.label.by,
              model: result.label.model,
              confidence: result.label.confidence,
              at: new Date(result.label.at),
              note_tl: result.label.note_tl,
            },
          },
        },
      );

      if (result.requestOther) {
        await V2ProblemRequestModel().create({
          user_id: opts.userId,
          wrong: opts.wrong,
          right: opts.right,
          note_tl: result.label.note_tl,
          question_type: opts.questionType,
          day: opts.learnerDay,
          at: new Date(),
        });
      }

      if (
        result.label.id !== 'slip' &&
        result.label.id !== 'unsure'
      ) {
        await applyWeakSpotAfterLabel({
          userId: opts.userId,
          problemId: result.label.id,
          errorId: opts.errorId,
          confidence: result.label.confidence,
          wrong: opts.wrong,
          right: result.label.note_tl ?? opts.right,
          itemIds: opts.itemIds ?? [],
        });
      }
    } catch {
      // Never surface to the learner path.
    }
  })();
}
