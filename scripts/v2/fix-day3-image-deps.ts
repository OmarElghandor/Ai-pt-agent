/**
 * Day 3 image deps: generate character.manuel, regenerate blocked scenes,
 * promote flagged word images that already have Cloudinary URLs.
 *
 * Usage: npx tsx scripts/v2/fix-day3-image-deps.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { connectMongo, mongoConfigured } from '../../lib/mongo';
import {
  buildImageManifest,
  generateCharacterSheet,
  generateContentImage,
  getImageByKey,
  runImageSpecs,
  specWithoutKey,
} from '../../lib/v2/images';
import type { ImageSpec } from '../../lib/v2/generation/images/templates';
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

function dayPad(day: number): string {
  return String(day).padStart(2, '0');
}

function fail(msg: string): never {
  console.error('FAIL:', msg);
  process.exit(1);
}

async function main() {
  const day = 3;
  if (!mongoConfigured()) fail('MongoDB not configured');
  await connectMongo();

  const lesson =
    (await getPublishedLesson(day)) || (await getLatestLessonPack(day));
  if (!lesson) fail(`no lesson for day ${day}`);
  const story =
    (await getPublishedStory({ day })) ||
    (await getStoryById(`pt-PT.day-${dayPad(day)}`));
  if (!story) fail(`no story for day ${day}`);

  console.log(
    `— day ${day} lesson v${lesson.version} status=${lesson.status}`,
  );

  // 1) Ensure manuel sheet
  console.log('— character.manuel');
  const existingManuel = await getImageByKey('character.manuel');
  if (
    existingManuel?.url &&
    (existingManuel.status === 'ready' || existingManuel.status === 'flagged')
  ) {
    console.log(
      'manuel already usable',
      existingManuel.status,
      existingManuel.url.slice(0, 80),
    );
  } else {
    const manuel = await generateCharacterSheet('manuel');
    console.log(
      JSON.stringify({
        status: manuel.doc.status,
        url: manuel.doc.url ?? null,
        reason: manuel.reason ?? manuel.doc.reason ?? null,
        skipped: manuel.skipped,
      }),
    );
    if (!manuel.doc.url) {
      fail(
        `character.manuel has no url (${manuel.doc.status}: ${manuel.reason ?? manuel.doc.reason}). Check OpenAI credits.`,
      );
    }
  }

  const usedBy = [
    `lesson:${lesson.target_lang}.day-${dayPad(day)}.v${lesson.version}`,
    `story:${story.id}.v${story.version}`,
  ];

  const manifest = buildImageManifest({
    pack: lesson.pack,
    story,
    day,
    targetLang: lesson.target_lang,
  });
  const keys = manifest.map((m) => m.key);
  const docs = await V2ImageModel()
    .find({ key: { $in: keys } })
    .select({ key: 1, status: 1, reason: 1, url: 1, spec: 1 })
    .lean();
  const byKey = new Map(docs.map((d) => [d.key, d]));

  // 2) Promote flagged words that already have URLs
  const wordKeys = manifest
    .filter((m) => m.source === 'word')
    .map((m) => m.key);
  let promoted = 0;
  for (const key of wordKeys) {
    const doc = byKey.get(key);
    if (doc?.status === 'flagged' && doc.url) {
      await V2ImageModel().updateOne(
        { key },
        {
          $set: { status: 'ready' },
          $unset: { reason: 1, generating_started_at: 1 },
        },
      );
      promoted += 1;
      console.log('promoted word', key);
    }
  }
  console.log(`— promoted ${promoted} flagged words → ready`);

  // 3) Regenerate blocked scene/phrase keys (and any still without url)
  const blockedKeys = keys.filter((key) => {
    const doc = byKey.get(key);
    if (!doc) return true;
    if (doc.status === 'blocked') return true;
    if (doc.status === 'failed' && !doc.url) return true;
    // phrases/story that somehow still missing url
    const entry = manifest.find((m) => m.key === key);
    if (
      entry &&
      (entry.source === 'phrase' || entry.source === 'story_scene') &&
      !doc.url
    ) {
      return true;
    }
    return false;
  });

  console.log('— regenerate blocked/missing', blockedKeys);

  if (blockedKeys.length) {
    console.log('— runImageSpecs for blocked keys');
    const specs = await runImageSpecs({
      day,
      pack: lesson.pack,
      story,
      keys: blockedKeys,
    });

    for (const key of blockedKeys) {
      console.log(`— generate ${key}`);
      let lessonSpec = specs.byKey.get(key);
      const prior = byKey.get(key);
      const priorSpec = prior?.spec as ImageSpec | undefined;
      const spec: ImageSpec = lessonSpec
        ? specWithoutKey(lessonSpec)
        : priorSpec
          ? {
              type: priorSpec.type ?? 'scene',
              subject: priorSpec.subject ?? key,
              characters: priorSpec.characters ?? [],
              must_avoid: priorSpec.must_avoid ?? ['text', 'letters', 'numbers'],
              pose: priorSpec.pose,
              expression: priorSpec.expression,
              setting: priorSpec.setting,
              framing: priorSpec.framing,
              light: priorSpec.light,
              must_show: priorSpec.must_show,
              intent: priorSpec.intent,
            }
          : {
              type: 'scene',
              subject: key,
              characters: ['yassin', 'manuel'],
              must_avoid: ['text', 'letters', 'numbers'],
            };

      const result = await generateContentImage({
        key,
        spec,
        usedBy:
          key.startsWith('story.')
            ? [`story:${story.id}.v${story.version}`]
            : [
                `lesson:${lesson.target_lang}.day-${dayPad(day)}.v${lesson.version}`,
              ],
        force: true,
      });

      console.log(
        JSON.stringify({
          key,
          status: result.doc.status,
          url: result.doc.url ?? null,
          reason: result.reason ?? result.doc.reason ?? null,
        }),
      );

      if (!result.doc.url) {
        fail(
          `${key} still has no url (${result.doc.status}: ${result.reason ?? result.doc.reason})`,
        );
      }
      if (result.doc.status === 'flagged' && result.doc.url) {
        await V2ImageModel().updateOne(
          { key },
          {
            $set: { status: 'ready' },
            $unset: { reason: 1, generating_started_at: 1 },
          },
        );
      }
    }
  }

  // 4) Final summary
  const finalDocs = await V2ImageModel()
    .find({ key: { $in: keys } })
    .select({ key: 1, status: 1, reason: 1, url: 1 })
    .lean();
  const summary = {
    ready: 0,
    flagged: 0,
    blocked: 0,
    failed: 0,
    missing: 0,
    other: 0,
  };
  for (const key of keys) {
    const d = finalDocs.find((x) => x.key === key);
    const status = d?.status ?? 'missing';
    if (status in summary) {
      summary[status as keyof typeof summary] += 1;
    } else {
      summary.other += 1;
    }
    console.log(
      JSON.stringify({
        key,
        status,
        hasUrl: Boolean(d?.url),
        reason: d?.reason ?? null,
      }),
    );
  }

  console.log('summary', summary);
  if (summary.blocked > 0) {
    fail(`${summary.blocked} keys still blocked`);
  }
  console.log(JSON.stringify({ ok: true, day, ...summary, promoted }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
