/**
 * Regen Day 1 questions only (whole-lesson bank). Does not touch the story.
 * Usage: npx tsx scripts/v2/regen-day1-questions-only.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

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

const DAY = 1;
const OUT = resolve(process.cwd(), 'examples/day01-generated.json');

async function main() {
  const { connectMongo, mongoConfigured } = await import('@/lib/mongo');
  if (!mongoConfigured()) {
    console.error('Mongo not configured');
    process.exit(1);
  }
  await connectMongo();

  const { getLatestLesson } = await import('@/lib/v2/generation/lesson/save');
  const { enqueueQuestionsRegen, runWorkerUntilIdle } = await import(
    '@/lib/v2/generation/jobs'
  );
  const { getStoryVersion } = await import(
    '@/lib/v2/generation/lesson/storySave'
  );

  const before = await getLatestLesson(DAY);
  if (!before) {
    console.error('No Day 1 lesson');
    process.exit(1);
  }
  console.log(`Day 1 v${before.version} — questions regen only`);

  const qEnq = await enqueueQuestionsRegen({ day: DAY });
  console.log(`questions job ${qEnq.questionsJobId}`);
  const processed = await runWorkerUntilIdle(
    `regen-q-${process.pid}-${Date.now().toString(36)}`,
    { maxEmptyRounds: 4, idleMs: 2500, deadlineMs: 280_000 },
  );
  console.log(`drain processed=${processed}`);

  const latest = await getLatestLesson(DAY);
  const story = await getStoryVersion({
    day: DAY,
    version: latest?.version ?? before.version,
  });

  const payload = {
    day: DAY,
    version: latest?.version,
    status: latest?.status,
    items: (latest?.data.items ?? []).filter((i) =>
      [
        'phrase.good_night',
        'phrase.nice_to_meet',
        'phrase.likewise',
        'pattern.chamo_me',
      ].includes(i.id),
    ),
    questions: latest?.data.questions ?? [],
    story: story
      ? {
          id: story.id,
          version: story.version,
          setting: story.setting,
          cast: story.cast,
          lines: story.lines,
        }
      : null,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
  console.log(`Wrote ${OUT}`);
  console.log(`questions=${payload.questions.length}`);
  console.log(
    payload.questions
      .map(
        (q) =>
          `${q.id}\t${q.type}\t${Array.isArray(q.tests) ? q.tests.join(',') : ''}`,
      )
      .join('\n'),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
