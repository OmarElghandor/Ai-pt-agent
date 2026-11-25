/**
 * Full-cycle smoke test: one vocab key → specs → OpenAI → Cloudinary → Mongo attach.
 *
 * Usage:
 *   npx tsx scripts/v2/test-one-vocab-image.ts --day=3 --key=word.galao
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { connectMongo, mongoConfigured } from '../../lib/mongo';
import {
  STYLE_ANCHOR_KEY,
  generateContentImage,
  generateStyleAnchor,
  getImageByKey,
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
import { V2ImageModel, V2LessonModel } from '../../lib/v2/mongo/models';

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

function argValue(argv: string[], name: string): string | null {
  const flag = `--${name}=`;
  for (const a of argv) {
    if (a.startsWith(flag)) return a.slice(flag.length);
  }
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1]!.startsWith('--')) {
    return argv[idx + 1]!;
  }
  return null;
}

function fail(msg: string): never {
  console.error('FAIL:', msg);
  process.exit(1);
}

async function ensureStyleAnchor(): Promise<void> {
  const existing = await getImageByKey(STYLE_ANCHOR_KEY);
  if (existing?.url && (existing.status === 'ready' || existing.status === 'flagged')) {
    console.log('style_anchor ok', existing.status, existing.url.slice(0, 80));
    return;
  }
  console.log('— bootstrapping style_anchor');
  const boot = await generateStyleAnchor();
  if (!boot.doc.url) {
    fail(`style_anchor failed: ${boot.reason ?? boot.doc.reason ?? boot.doc.status}`);
  }
  console.log('style_anchor', boot.doc.status, boot.doc.url);
}

function dayPad(day: number): string {
  return String(day).padStart(2, '0');
}

async function main() {
  const argv = process.argv.slice(2);
  const day = Number(argValue(argv, 'day') ?? '3');
  const key = argValue(argv, 'key') ?? 'word.galao';
  if (!Number.isInteger(day) || day < 1) fail(`bad day: ${day}`);
  if (!key.trim()) fail('key required');

  if (!mongoConfigured()) fail('MongoDB not configured');
  await connectMongo();

  console.log(`— test one vocab image day=${day} key=${key}`);

  const lesson =
    (await getPublishedLesson(day)) || (await getLatestLessonPack(day));
  if (!lesson) fail(`no lesson for day ${day}`);
  console.log(
    `lesson v${lesson.version} status=${lesson.status} target_lang=${lesson.target_lang}`,
  );

  const storyId = `pt-PT.day-${dayPad(day)}`;
  const story =
    (await getPublishedStory({ day })) || (await getStoryById(storyId));
  if (!story) {
    console.warn(`no story for day ${day} (${storyId}); continuing without story`);
  }

  await ensureStyleAnchor();

  await V2ImageModel().updateOne(
    { key },
    {
      $set: { status: 'queued', reason: null },
      $unset: { generating_started_at: 1 },
    },
    { upsert: true },
  );

  console.log('— runImageSpecs (single key)');
  const specs = await runImageSpecs({
    day,
    pack: lesson.pack,
    story: story ?? null,
    keys: [key],
  });
  const lessonSpec = specs.byKey.get(key);
  if (!lessonSpec) fail(`no spec produced for ${key}`);

  console.log(
    'spec',
    JSON.stringify({
      type: lessonSpec.type,
      characters: lessonSpec.characters ?? [],
      subject: lessonSpec.subject,
      intent: lessonSpec.intent,
    }),
  );

  if (lessonSpec.type === 'object') {
    const chars = lessonSpec.characters ?? [];
    if (chars.length > 0) {
      fail(
        `object spec still has characters=${JSON.stringify(chars)} (cast rotation bug)`,
      );
    }
  }

  const usedBy = [
    `lesson:${lesson.target_lang}.day-${dayPad(day)}.v${lesson.version}`,
  ];
  console.log('— generateContentImage force=true', { usedBy });
  const result = await generateContentImage({
    key,
    spec: specWithoutKey(lessonSpec),
    usedBy,
    force: true,
  });

  console.log(
    'generate result',
    JSON.stringify({
      status: result.doc.status,
      url: result.doc.url ?? null,
      public_id: result.doc.public_id ?? null,
      reason: result.reason ?? result.doc.reason ?? null,
      skipped: result.skipped,
    }),
  );

  if (result.skipped) {
    fail(`generation skipped: ${result.reason ?? result.doc.reason}`);
  }
  if (result.doc.status === 'blocked' || result.doc.status === 'failed') {
    fail(
      `generation ${result.doc.status}: ${result.reason ?? result.doc.reason}`,
    );
  }
  if (!result.doc.url) {
    fail(`no url after generate (status=${result.doc.status})`);
  }

  // Soft vision QA may flag; URL is still usable for attach.
  if (result.doc.status === 'flagged' && result.doc.url) {
    await V2ImageModel().updateOne(
      { key },
      {
        $set: { status: 'ready' },
        $unset: { reason: 1, generating_started_at: 1 },
      },
    );
  }

  const img = await V2ImageModel().findOne({ key }).lean();
  if (!img?.url) fail('v2_images missing url after generate');
  if (!img.public_id) fail('v2_images missing public_id (Cloudinary upload?)');
  if (img.status !== 'ready' && img.status !== 'flagged') {
    fail(`v2_images unexpected status=${img.status}`);
  }

  const urlOk =
    img.url.startsWith('https://res.cloudinary.com/') ||
    img.url.startsWith('/api/v2/dev/local-images/');
  if (!urlOk) fail(`unexpected url shape: ${img.url}`);

  try {
    const head = await fetch(img.url, { method: 'HEAD' });
    if (!head.ok) {
      const get = await fetch(img.url, { method: 'GET' });
      if (!get.ok) fail(`url not reachable: ${img.url} (${head.status}/${get.status})`);
    }
    console.log('url reachable', img.url.slice(0, 100));
  } catch (err) {
    fail(`url fetch error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const lessonDoc = await V2LessonModel()
    .findOne({
      day,
      target_lang: lesson.target_lang,
      version: lesson.version,
    })
    .lean();
  if (!lessonDoc?.data) fail('lesson doc missing after denormalize');
  const items = (lessonDoc.data as { items?: { id: string; image?: { key?: string; url?: string } }[] })
    .items ?? [];
  const item = items.find((i) => i.id === key);
  if (!item) fail(`lesson items missing id=${key}`);
  if (item.image?.key !== key) {
    fail(`item.image.key mismatch: ${JSON.stringify(item.image)}`);
  }
  if (!item.image?.url || item.image.url !== img.url) {
    fail(
      `item.image.url not attached: item=${item.image?.url ?? null} v2_images=${img.url}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        day,
        key,
        lesson_version: lesson.version,
        status: img.status,
        public_id: img.public_id,
        url: img.url,
        item_image: item.image,
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
