/**
 * Regen day-level questions only (keeps story / pages / real_world handoff).
 * Usage: npx tsx scripts/v2/regen-questions-day.ts [day]
 * Default day=3. Writes tmp/dayNN-questions.json
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

const DAY = Math.max(1, Number(process.argv[2] ?? 3) || 3);
const OUT = resolve(
  process.cwd(),
  `tmp/day${String(DAY).padStart(2, '0')}-questions.json`,
);

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

  const before = await getLatestLesson(DAY);
  if (!before) {
    console.error(`No Day ${DAY} lesson`);
    process.exit(1);
  }
  console.log(`Day ${DAY} v${before.version} — questions regen only`);

  const handoffs = (before.meta as { handoffs?: Record<string, unknown> } | undefined)
    ?.handoffs;
  const rw = handoffs?.real_world as
    | { hide?: boolean; phrases?: { id: string; tl?: string }[] }
    | undefined;
  console.log(
    `real_world handoff: hide=${rw?.hide ?? 'n/a'} phrases=${rw?.phrases?.length ?? 0}`,
  );

  const qEnq = await enqueueQuestionsRegen({ day: DAY });
  console.log(`questions job ${qEnq.questionsJobId} requeued=${qEnq.requeued.join(',')}`);
  const processed = await runWorkerUntilIdle(
    `regen-q-${process.pid}-${Date.now().toString(36)}`,
    { maxEmptyRounds: 4, idleMs: 2500, deadlineMs: 280_000 },
  );
  console.log(`drain processed=${processed}`);

  const latest = await getLatestLesson(DAY);
  const questions = latest?.data.questions ?? [];
  const rwQs = questions.filter((q) => {
    const tests = Array.isArray(q.tests) ? q.tests.map(String) : [];
    return tests.some((t) => t.startsWith('phrase.rw.'));
  });

  const payload = {
    day: DAY,
    version: latest?.version,
    status: latest?.status,
    total: questions.length,
    rw_count: rwQs.length,
    rw_types: rwQs.map((q) => q.type),
    questions: questions.map((q) => ({
      id: q.id,
      type: q.type,
      skill: q.skill,
      tests: q.tests,
      page_id: q.page_id,
      prompt: q.prompt,
      options: q.options,
      answer: q.answer,
      rw: Array.isArray(q.tests)
        ? q.tests.some((t) => String(t).startsWith('phrase.rw.'))
        : false,
    })),
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
  console.log(`Wrote ${OUT}`);
  console.log(`questions=${payload.total} rw=${payload.rw_count}`);
  console.log(
    questions
      .map(
        (q) =>
          `${q.id}\t${q.type}\t${Array.isArray(q.tests) ? q.tests.join(',') : ''}${
            Array.isArray(q.tests) &&
            q.tests.some((t) => String(t).startsWith('phrase.rw.'))
              ? '\t← RW'
              : ''
          }`,
      )
      .join('\n'),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
