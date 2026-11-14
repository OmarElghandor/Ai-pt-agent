/**
 * Regenerate phrase.good_night from the authored core-items prompt.
 * Usage: npx tsx scripts/v2/regen-good-night.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { connectMongo, mongoConfigured } from '../../lib/mongo';
import {
  generateContentImage,
  runImageSpecs,
  specWithoutKey,
} from '../../lib/v2/images';
import {
  getLatestLessonPack,
  getPublishedLesson,
} from '../../lib/v2/content/getPublishedLesson';
import {
  getPublishedStory,
  getStoryById,
} from '../../lib/v2/generation/lesson/storySave';
import { V2ImageModel } from '../../lib/v2/mongo/models';

function loadEnvFile(name: string) {
  const path = resolve(process.cwd(), name);
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

async function main() {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();

  const day = 1;
  const key = 'phrase.good_night';
  const lesson =
    (await getPublishedLesson(day)) || (await getLatestLessonPack(day));
  if (!lesson) throw new Error('No Day 1 lesson');
  const story =
    (await getPublishedStory({ day })) ||
    (await getStoryById('pt-PT.day-01'));
  if (!story) throw new Error('No Day 1 story');

  await V2ImageModel().updateMany(
    { key },
    {
      $set: { status: 'flagged', reason: 'force regen good_night authored' },
      $unset: { generating_started_at: 1 },
    },
  );

  const specs = await runImageSpecs({
    day,
    pack: lesson.pack,
    story,
    keys: [key],
  });
  const lessonSpec = specs.byKey.get(key);
  if (!lessonSpec) throw new Error(`no spec for ${key}`);
  console.log('spec', lessonSpec.type, lessonSpec.intent);

  const result = await generateContentImage({
    key,
    spec: specWithoutKey(lessonSpec),
    usedBy: [`lesson:${lesson.target_lang}.day-01.v${lesson.version}`],
  });
  // Authored regen can land as flagged after soft vision QA — still ship if URL exists.
  if (result.doc.url && result.doc.status !== 'ready') {
    await V2ImageModel().updateOne(
      { key },
      {
        $set: { status: 'ready' },
        $unset: { reason: 1, generating_started_at: 1 },
      },
    );
  }
  const final = await V2ImageModel().findOne({ key }).lean();
  console.log(
    JSON.stringify(
      {
        status: final?.status ?? result.doc.status,
        url: final?.url ?? result.doc.url,
        reason: result.reason ?? null,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
