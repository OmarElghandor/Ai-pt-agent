/**
 * Regenerate Day 1 time-of-day greetings + story scene with lesson-aware specs.
 * Usage: npx tsx scripts/v2/regen-day1-greetings.ts
 */
import { existsSync, readFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { connectMongo, mongoConfigured } from '../../lib/mongo';
import {
  generateContentImage,
  localImagePath,
  runImageSpecs,
  specWithoutKey,
  storySceneKey,
} from '../../lib/v2/images';
import {
  getLatestLessonPack,
  getPublishedLesson,
} from '../../lib/v2/content/getPublishedLesson';
import {
  getPublishedStory,
  getStoryById,
} from '../../lib/v2/generation/lesson/storySave';
import { resolveLocalPathFromUrl } from '../../lib/v2/images/storage';
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

const KEYS = [
  'phrase.good_morning',
  'phrase.good_afternoon',
  'phrase.good_night',
] as const;

async function main() {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();

  const day = 1;
  const lesson =
    (await getPublishedLesson(day)) || (await getLatestLessonPack(day));
  if (!lesson) throw new Error('No Day 1 lesson');
  const story =
    (await getPublishedStory({ day })) ||
    (await getStoryById('pt-PT.day-01'));
  if (!story) throw new Error('No Day 1 story');

  const sceneKey = storySceneKey(day, story.target_lang);
  const allKeys = [...KEYS, sceneKey];

  // Reset statuses so lock can reclaim ready keys for overwrite
  await V2ImageModel().updateMany(
    { key: { $in: allKeys } },
    {
      $set: { status: 'flagged', reason: 'force regen lesson-aware' },
      $unset: { generating_started_at: 1 },
    },
  );

  console.log('— image_specs —');
  const specs = await runImageSpecs({
    day,
    pack: lesson.pack,
    story,
    keys: allKeys,
  });
  console.log('fromModel', specs.fromModel, 'brief', specs.visual_brief.theme_line);
  for (const s of specs.specs) {
    console.log(s.key, s.type, s.intent);
  }

  const outDir = resolve(process.cwd(), 'tmp', 'day1-images');
  mkdirSync(outDir, { recursive: true });
  const results: Record<string, { status: string; url?: string | null; path?: string }> = {};

  for (const key of allKeys) {
    const lessonSpec = specs.byKey.get(key);
    if (!lessonSpec) {
      console.warn('no spec for', key);
      continue;
    }
    console.log('— generate', key, '—');
    const usedBy =
      key.startsWith('story.')
        ? [`story:${story.id}.v${story.version}`]
        : [
            `lesson:${lesson.target_lang}.day-01.v${lesson.version}`,
          ];
    const result = await generateContentImage({
      key,
      spec: specWithoutKey(lessonSpec),
      usedBy,
    });
    console.log(result.doc.status, result.doc.url, result.reason ?? '');

    let localPath: string | undefined;
    if (result.doc.url) {
      localPath =
        resolveLocalPathFromUrl(String(result.doc.url)) ??
        (existsSync(localImagePath(key)) ? localImagePath(key) : undefined);
      if (localPath) {
        const dest = join(outDir, `${key.replace(/[^a-z0-9._-]/gi, '_')}.png`);
        copyFileSync(localPath, dest);
        localPath = dest;
      }
    }
    results[key] = {
      status: result.doc.status,
      url: result.doc.url,
      path: localPath,
    };
  }

  console.log('\n=== RESULT ===');
  console.log(JSON.stringify(results, null, 2));
  console.log('Copied under', outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
