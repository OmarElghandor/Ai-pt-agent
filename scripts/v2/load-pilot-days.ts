/**
 * Load hand-authored or generated gold packs for days 1–3 as drafts,
 * optionally warm audio and publish.
 *
 * Usage:
 *   npx tsx scripts/v2/load-pilot-days.ts
 *   npx tsx scripts/v2/load-pilot-days.ts --publish --warm-audio
 *
 * Looks for examples/day0N-example.json (N=1..3). Falls back to day06 shape
 * only when those files exist.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LessonPackSchema } from '../../lib/v2/content/lesson';
import { hasErrors, validateLessonPack } from '../../lib/v2/content/validate';
import { connectMongo, mongoConfigured } from '../../lib/mongo';
import { saveDraft, setLessonStatus } from '../../lib/v2/generation/lesson/save';
import { publishLesson } from '../../lib/v2/generation/lesson/publish';
import { warmLessonPackAudio } from '../../lib/v2/generation/warmAudio';
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

async function loadDay(day: number, publish: boolean, warm: boolean) {
  const path = resolve(
    process.cwd(),
    `examples/day${String(day).padStart(2, '0')}-example.json`,
  );
  if (!existsSync(path)) {
    console.warn(`skip day ${day}: missing ${path}`);
    return;
  }
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const parsed = LessonPackSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(`day ${day} zod failed`, parsed.error.message);
    process.exit(1);
  }
  const result = validateLessonPack(parsed.data, { mode: 'strict' });
  for (const issue of result.issues) {
    console.log(
      `day ${day} [${issue.severity}] ${issue.rule} @ ${issue.path}: ${issue.message}`,
    );
  }
  if (hasErrors(result)) {
    console.error(`day ${day}: strict validation failed — abort`);
    process.exit(1);
  }

  const saved = await saveDraft({
    day,
    pack: parsed.data,
    meta: { flagged: false, issues: result.issues },
  });
  console.log(`day ${day}: saved draft v${saved.version}`);

  if (warm) {
    const audio = await warmLessonPackAudio(parsed.data);
    console.log(`day ${day}: audio`, audio);
  }

  if (publish) {
    await setLessonStatus({ day, status: 'reviewed', version: saved.version });
    const pub = await publishLesson({ day, version: saved.version });
    console.log(
      `day ${day}: published v${pub.lesson.version} registry=${pub.registry.written}`,
    );
  }
}

async function main() {
  const publish = process.argv.includes('--publish');
  const warm = process.argv.includes('--warm-audio');

  if (!mongoConfigured()) {
    console.error('MONGODB_URI required');
    process.exit(1);
  }
  await connectMongo();
  const conj = await seedConjugations();
  console.log(`Seeded ${conj} conjugations`);

  for (const day of [1, 2, 3]) {
    await loadDay(day, publish, warm);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
