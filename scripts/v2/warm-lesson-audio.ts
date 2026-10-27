/**
 * Warm TTS cache for a published/draft v2 lesson day.
 * Usage: npx tsx scripts/v2/warm-lesson-audio.ts <day>
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getLatestLesson } from '@/lib/v2/generation/lesson/save';
import { warmLessonPackAudio } from '@/lib/v2/generation/warmAudio';

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
  const day = Number(process.argv[2]);
  if (!Number.isInteger(day) || day < 1) {
    console.error('Usage: npx tsx scripts/v2/warm-lesson-audio.ts <day>');
    process.exit(1);
  }
  const lesson = await getLatestLesson(day);
  if (!lesson) {
    console.error(`No lesson found for day ${day}`);
    process.exit(1);
  }
  const result = await warmLessonPackAudio(lesson.data);
  console.log(JSON.stringify({ day, version: lesson.version, ...result }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
