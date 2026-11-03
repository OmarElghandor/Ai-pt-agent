/**
 * Regenerate lesson images for a day, preferring authored/override prompts.
 * Usage: npx tsx scripts/v2/regen-day-images.ts --day=1
 */
import { existsSync, readFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { connectMongo, mongoConfigured } from '../../lib/mongo';
import {
  buildImageManifest,
  generateContentImage,
  generateCharacterSheet,
  localImagePath,
  resolveImageScene,
  runImageSpecs,
  specFromAuthoredScene,
  specWithoutKey,
  storySceneKey,
} from '../../lib/v2/images';
import { resolveLocalPathFromUrl } from '../../lib/v2/images/storage';
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

function parseDay(argv: string[]): number {
  for (const a of argv) {
    if (a.startsWith('--day=')) return Number(a.slice('--day='.length));
    if (a === '--day') continue;
  }
  const idx = argv.indexOf('--day');
  if (idx >= 0 && argv[idx + 1]) return Number(argv[idx + 1]);
  return 1;
}

async function ensureSheets(characterIds: string[]) {
  for (const id of [...new Set(characterIds)]) {
    const key = `character.${id}`;
    const doc = await V2ImageModel().findOne({ key, status: 'ready' }).lean();
    if (doc?.url) {
      console.log('sheet ready', key);
      continue;
    }
    console.log('— generate sheet', id);
    const result = await generateCharacterSheet(id);
    console.log(result.doc.status, result.doc.url, result.reason ?? '');
  }
}

async function main() {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();

  const day = parseDay(process.argv.slice(2));
  if (!Number.isFinite(day) || day < 1) throw new Error('Invalid --day');

  const lesson =
    (await getPublishedLesson(day)) || (await getLatestLessonPack(day));
  if (!lesson) throw new Error(`No lesson for day ${day}`);
  const story =
    (await getPublishedStory({ day })) ||
    (await getStoryById(`pt-PT.day-${String(day).padStart(2, '0')}`));
  if (!story) throw new Error(`No story for day ${day}`);

  const manifest = buildImageManifest({
    pack: lesson.pack,
    story,
    day,
    targetLang: story.target_lang,
  });
  const allKeys = [...new Set(manifest.map((m) => m.key))];
  console.log('manifest keys', allKeys);

  const neededChars = new Set<string>();
  for (const entry of manifest) {
    const resolved = await resolveImageScene({
      day,
      key: entry.key,
      itemId: entry.itemId,
      targetLang: story.target_lang,
    });
    for (const c of resolved.characters) neededChars.add(c);
  }
  await ensureSheets([...neededChars]);

  await V2ImageModel().updateMany(
    { key: { $in: allKeys } },
    {
      $set: { status: 'flagged', reason: 'force regen authored prompts' },
      $unset: { generating_started_at: 1 },
    },
  );

  const needSpecsKeys: string[] = [];
  const resolvedByKey = new Map<
    string,
    Awaited<ReturnType<typeof resolveImageScene>>
  >();
  for (const entry of manifest) {
    const resolved = await resolveImageScene({
      day,
      key: entry.key,
      itemId: entry.itemId,
      targetLang: story.target_lang,
    });
    resolvedByKey.set(entry.key, resolved);
    if (!resolved.skipSpecs) needSpecsKeys.push(entry.key);
  }

  const specsByKey = new Map<string, ReturnType<typeof specWithoutKey>>();
  if (needSpecsKeys.length) {
    console.log('— image_specs for', needSpecsKeys);
    const specs = await runImageSpecs({
      day,
      pack: lesson.pack,
      story,
      keys: needSpecsKeys,
    });
    for (const [k, v] of specs.byKey) specsByKey.set(k, specWithoutKey(v));
  } else {
    console.log('— all keys authored/override; skipping image_specs');
  }

  const outDir = resolve(process.cwd(), 'tmp', `day${day}-images`);
  mkdirSync(outDir, { recursive: true });
  const results: Record<
    string,
    {
      status: string;
      url?: string | null;
      path?: string;
      source?: string;
      intent?: string;
    }
  > = {};

  for (const entry of manifest) {
    const key = entry.key;
    const resolved = resolvedByKey.get(key)!;
    let spec = resolved.scenePrompt
      ? specFromAuthoredScene({
          scenePrompt: resolved.scenePrompt,
          characters: resolved.characters,
          ratio: resolved.ratio,
        })
      : null;
    if (!spec) {
      const lessonSpec = specsByKey.get(key);
      if (!lessonSpec) {
        console.warn('no spec for', key);
        continue;
      }
      spec = lessonSpec;
    }

    console.log(
      '— generate',
      key,
      '—',
      resolved.source,
      resolved.scenePrompt?.slice(0, 60) ?? '',
    );
    const usedBy = key.startsWith('story.')
      ? [`story:${story.id}.v${story.version}`]
      : [
          `lesson:${lesson.target_lang}.day-${String(day).padStart(2, '0')}.v${lesson.version}`,
        ];
    const result = await generateContentImage({
      key,
      spec,
      usedBy,
      force: true,
      scenePrompt: resolved.scenePrompt ?? undefined,
      promptSource: resolved.source,
      ratio: resolved.ratio ?? undefined,
    });
    console.log(result.doc.status, result.doc.url, result.reason ?? '');

    let localPath: string | undefined;
    if (result.doc.url) {
      localPath =
        resolveLocalPathFromUrl(String(result.doc.url)) ??
        (existsSync(localImagePath(key)) ? localImagePath(key) : undefined);
      if (localPath) {
        const dest = join(
          outDir,
          `${key.replace(/[^a-z0-9._-]/gi, '_')}.png`,
        );
        copyFileSync(localPath, dest);
        localPath = dest;
      }
    }
    results[key] = {
      status: result.doc.status,
      url: result.doc.url,
      path: localPath,
      source: resolved.source,
      intent: spec.intent,
    };
  }

  console.log('\n=== RESULT ===');
  console.log(JSON.stringify(results, null, 2));
  console.log('Copied under', outDir);
  console.log('story key', storySceneKey(day, story.target_lang));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
