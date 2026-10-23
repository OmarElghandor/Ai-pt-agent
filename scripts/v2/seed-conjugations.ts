import { loadConjugationSeed } from '../../lib/v2/content/conjugations/resolve';
import { connectMongo, mongoConfigured } from '../../lib/mongo';
import { V2ConjugationModel } from '../../lib/v2/mongo/models';

export async function seedConjugations(): Promise<number> {
  if (!mongoConfigured()) {
    throw new Error('MONGODB_URI required');
  }
  await connectMongo();
  const seed = loadConjugationSeed();
  const Model = V2ConjugationModel();
  let n = 0;
  for (const verb of seed.verbs) {
    await Model.updateOne(
      { lemma: verb.lemma, target_lang: seed.target_lang },
      {
        $set: {
          lemma: verb.lemma,
          target_lang: seed.target_lang,
          class: verb.class,
          meaning_ar: verb.meaning_ar,
          verified: verb.verified,
          overrides: verb.overrides ?? {},
        },
      },
      { upsert: true },
    );
    n += 1;
  }
  return n;
}
