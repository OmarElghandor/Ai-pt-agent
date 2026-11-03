/**
 * Slice A demo: generate yassin + ines character sheets, then Day 1 story scene.
 * Usage: npx tsx scripts/v2/generate-day1-images.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { connectMongo, mongoConfigured } from '../../lib/mongo';
import {
  generateCharacterSheet,
  generateContentImage,
  generateStyleAnchor,
  getImageByKey,
  storySceneKey,
} from '../../lib/v2/images';
import { buildSceneImageSpec } from '../../lib/v2/generation/lesson/storyCodeEnrich';
import {
  getPublishedStory,
  getStoryById,
} from '../../lib/v2/generation/lesson/storySave';
import type { ImageSpec } from '../../lib/v2/generation/images/templates';

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
  if (!mongoConfigured()) {
    throw new Error('MongoDB not configured');
  }
  await connectMongo();

  console.log('— style_anchor —');
  const anchor = await generateStyleAnchor();
  console.log(anchor.doc.status, anchor.doc.url, anchor.reason ?? '');

  const sheets: Record<string, string | null | undefined> = {};
  for (const id of ['yassin', 'ines'] as const) {
    console.log(`— character.${id} —`);
    const result = await generateCharacterSheet(id);
    console.log(
      result.doc.status,
      result.doc.url,
      result.skipped ? `(skipped: ${result.reason})` : '',
      result.doc.cost_usd != null ? `$${Number(result.doc.cost_usd).toFixed(3)}` : '',
    );
    sheets[id] = result.doc.url;
    if (result.doc.status !== 'ready' && result.doc.status !== 'flagged') {
      throw new Error(
        `character ${id} failed: ${result.doc.status} ${result.reason}`,
      );
    }
  }

  console.log('— story.pt-PT.day-01.scene —');
  const story =
    (await getPublishedStory({ day: 1 })) ||
    (await getStoryById('pt-PT.day-01'));
  if (!story) {
    throw new Error('No Day 1 story in Mongo — generate the lesson/story first');
  }
  const key = storySceneKey(1, story.target_lang);
  const spec: ImageSpec =
    (story.image_spec as ImageSpec | undefined) ??
    buildSceneImageSpec({ setting: story.setting, cast: story.cast });
  const scene = await generateContentImage({
    key,
    spec,
    usedBy: [`story:${story.id}.v${story.version}`],
  });
  console.log(
    scene.doc.status,
    scene.doc.url,
    scene.reason ?? '',
    scene.doc.cost_usd != null
      ? `$${Number(scene.doc.cost_usd).toFixed(3)}`
      : '',
  );

  const yassin = await getImageByKey('character.yassin');
  const ines = await getImageByKey('character.ines');
  const day1 = await getImageByKey(key);

  console.log('\n=== RESULT ===');
  console.log(
    JSON.stringify(
      {
        yassin: yassin?.url ?? sheets.yassin,
        ines: ines?.url ?? sheets.ines,
        day1_scene: day1?.url ?? scene.doc.url,
        statuses: {
          yassin: yassin?.status,
          ines: ines?.status,
          day1_scene: day1?.status ?? scene.doc.status,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
