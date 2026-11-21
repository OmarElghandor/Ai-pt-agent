/**
 * Backfill mastery stages on v2_item_state (16 §6 / E1).
 *
 *   npx tsx scripts/v2/backfill-stages.ts           # dry run
 *   npx tsx scripts/v2/backfill-stages.ts --apply   # write
 */
import { connectMongo, mongoConfigured } from '../../lib/mongo';
import { V2ItemStateModel } from '../../lib/v2/mongo/models';
import { inferStageFromState, type ItemState } from '../../lib/v2/progress';

async function main() {
  const apply = process.argv.includes('--apply');
  if (!mongoConfigured()) {
    console.error('MongoDB not configured');
    process.exit(1);
  }
  await connectMongo();
  const docs = await V2ItemStateModel().find({}).lean();
  let wouldUpdate = 0;
  let updated = 0;
  for (const doc of docs) {
    const state = {
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
        interval: Number((doc.card as { interval?: number })?.interval ?? 0),
        dueAt: null,
        masteryLevel:
          (doc.card as { masteryLevel?: string })?.masteryLevel === 'mastered'
            ? ('mastered' as const)
            : ('learning' as const),
        consecutiveCorrect: 0,
        face: 'recognize',
        knowCheckDueAt: null,
      },
      lastImplicitReviewLocalDate: null,
      weakToolIds: [],
      stage: (doc.stage as 1 | 2 | 3 | 4 | undefined) ?? undefined,
      stage_at: (doc.stage_at as string | null) ?? null,
      first_recognition_at: (doc.first_recognition_at as string | null) ?? null,
      first_recall_at: (doc.first_recall_at as string | null) ?? null,
    } satisfies ItemState;

    if (state.stage != null && state.stage >= 1) continue;
    const inferred = inferStageFromState(state);
    wouldUpdate += 1;
    if (apply) {
      await V2ItemStateModel().updateOne(
        { user_id: state.user_id, item_id: state.item_id },
        {
          $set: {
            stage: inferred.stage,
            stage_at: inferred.stage_at,
            first_recognition_at: inferred.first_recognition_at,
            first_recall_at: inferred.first_recall_at,
          },
        },
      );
      updated += 1;
    }
  }
  console.log(
    apply
      ? `Updated ${updated} / ${docs.length} item states`
      : `Dry run: would update ${wouldUpdate} / ${docs.length} (pass --apply to write)`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
