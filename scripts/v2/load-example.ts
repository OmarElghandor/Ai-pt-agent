#!/usr/bin/env tsx
/**
 * Validate examples/day06-example.json (strict) and publish via publishLesson.
 * Day 11 (ESTAR gold pack; filename kept from the old day-6 order).
 * Also seeds v2_conjugations from content/v2/conjugations/pt-PT.json.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LessonPackSchema } from '../../lib/v2/content/lesson';
import { hasErrors, validateLessonPack } from '../../lib/v2/content/validate';
import { connectMongo, mongoConfigured } from '../../lib/mongo';
import { saveDraft, setLessonStatus } from '../../lib/v2/generation/lesson/save';
import { publishLesson } from '../../lib/v2/generation/lesson/publish';
import { seedConjugations } from './seed-conjugations';

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
  const path = resolve(process.cwd(), 'examples/day06-example.json');
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const parsed = LessonPackSchema.safeParse(raw);
  if (!parsed.success) {
    console.error('zod failed', parsed.error.flatten());
    process.exit(1);
  }

  const result = validateLessonPack(parsed.data, { mode: 'strict' });
  for (const issue of result.issues) {
    console.log(`[${issue.severity}] ${issue.rule} @ ${issue.path}: ${issue.message}`);
  }
  if (hasErrors(result)) {
    console.error('Validation errors — aborting load');
    process.exit(1);
  }

  if (!mongoConfigured()) {
    console.error('MONGODB_URI required');
    process.exit(1);
  }
  await connectMongo();

  const conjCount = await seedConjugations();
  console.log(`Seeded ${conjCount} conjugations`);

  const day = parsed.data.lesson.day;
  const saved = await saveDraft({
    day,
    targetLang: parsed.data.lesson.target_lang,
    pack: parsed.data,
    meta: { flagged: false, issues: result.issues },
  });
  await setLessonStatus({
    day,
    targetLang: parsed.data.lesson.target_lang,
    status: 'reviewed',
    version: saved.version,
  });
  const pub = await publishLesson({
    day,
    targetLang: parsed.data.lesson.target_lang,
    version: saved.version,
  });

  console.log(
    `Published Day ${day} (${pub.lesson.target_lang}) version ${pub.lesson.version}`,
  );
  const mongoose = await import('mongoose');
  await mongoose.default.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  try {
    const mongoose = await import('mongoose');
    await mongoose.default.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
