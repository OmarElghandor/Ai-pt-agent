/**
 * Build + publish a practice pack from the published lesson (Dia 3 pilot).
 * Usage: npx tsx scripts/v2/seed-pack-day.ts 3
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

import { getPublishedLesson } from '@/lib/v2/content/getPublishedLesson';
import { validatePracticePack } from '@/lib/v2/content/validatePack';
import { buildPackFromLesson } from '@/lib/v2/generation/pack/buildFromLesson';
import {
  savePackDraft,
  setPackStatus,
  updatePackDraft,
} from '@/lib/v2/generation/pack/save';
import { getDayPlan } from '@/lib/v2/generation/lesson/plan';
import { connectMongo, mongoConfigured } from '@/lib/mongo';

async function ensurePublishedLesson(day: number) {
  let lesson = await getPublishedLesson(day);
  if (lesson) return lesson;

  // Fallback: load gold example and publish as draft→published
  const { existsSync, readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const { LessonPackSchema } = await import('@/lib/v2/content/lesson');
  const { hasErrors, validateLessonPack } = await import(
    '@/lib/v2/content/validate'
  );
  const { saveDraft, setLessonStatus } = await import(
    '@/lib/v2/generation/lesson/save'
  );
  const path = resolve(
    process.cwd(),
    `examples/day${String(day).padStart(2, '0')}-example.json`,
  );
  if (!existsSync(path)) {
    throw new Error(
      `No published lesson for day ${day} and missing ${path}`,
    );
  }
  console.log(`No published lesson — loading ${path}`);
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const parsed = LessonPackSchema.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.message);
  const result = validateLessonPack(parsed.data, { mode: 'strict' });
  if (hasErrors(result)) {
    console.error(result.issues.filter((i) => i.severity === 'error'));
    throw new Error('example lesson invalid');
  }
  const saved = await saveDraft({
    day,
    pack: parsed.data,
    meta: { flagged: false, issues: result.issues },
  });
  await setLessonStatus({
    day,
    status: 'reviewed',
    version: saved.version,
  });
  await setLessonStatus({
    day,
    status: 'published',
    version: saved.version,
  });
  lesson = await getPublishedLesson(day);
  if (!lesson) throw new Error('publish failed');
  return lesson;
}

async function main() {
  const day = Number(process.argv[2] ?? 3);
  if (!mongoConfigured()) throw new Error('Mongo not configured');
  await connectMongo();
  const lesson = await ensurePublishedLesson(day);

  const plan = getDayPlan(day);
  const data = buildPackFromLesson({
    day,
    lesson: lesson.pack,
    chatCharacter: plan.generation?.chat_character ?? 'rita',
    targetLang: lesson.target_lang,
  });
  const v = validatePracticePack(data, { items: lesson.pack.items ?? [] });
  if (!v.ok) {
    console.error(v.issues);
    throw new Error('pack invalid');
  }

  const draft = await savePackDraft({
    day,
    targetLang: lesson.target_lang,
    data,
    meta: {
      lesson_version: lesson.version,
      stale: false,
      text_ready: true,
      flagged: false,
    },
  });
  await updatePackDraft({
    day,
    version: draft.version,
    mergeMeta: true,
    meta: { lesson_version: lesson.version, text_ready: true },
  });
  const published = await setPackStatus({
    day,
    version: draft.version,
    status: 'published',
  });
  console.log(
    JSON.stringify(
      {
        day,
        version: published?.version,
        lesson_version: lesson.version,
        beats: data.beats.length,
        skills: data.beats.reduce(
          (acc, b) => {
            acc[b.skill] = (acc[b.skill] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
