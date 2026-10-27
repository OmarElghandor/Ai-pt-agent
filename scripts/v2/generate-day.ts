/**
 * Generate a v2 lesson day via the linked-jobs DAG (in-process worker batch).
 * Usage: npx tsx scripts/v2/generate-day.ts <day>
 *
 * For background jobs: POST /api/v2/admin/generate + npm run v2:worker
 * Audio: npm run warm:v2-lesson-audio -- <day>
 * Images: set GENERATE_IMAGES=true (default off)
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  enqueueGenerateLesson,
  getLatestJobsForDay,
  listJobsForVersion,
  runWorkerBatch,
  summarizeJobGraph,
} from '@/lib/v2/generation/jobs';
import { getLessonVersion } from '@/lib/v2/generation/lesson/save';

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
  const args = process.argv.slice(2);
  const day = Number(args.find((a) => /^\d+$/.test(a)));
  if (!Number.isInteger(day) || day < 1) {
    console.error('Usage: npx tsx scripts/v2/generate-day.ts <day>');
    process.exit(1);
  }

  const enqueued = await enqueueGenerateLesson({ day });
  console.info(
    `[v2-gen] enqueued day=${enqueued.day} v${enqueued.version} jobs=${enqueued.jobIds.length}`,
  );

  const workerId = `cli-${process.pid}-${randomBytes(3).toString('hex')}`;
  const processed = await runWorkerBatch(workerId);
  console.info(`[v2-gen] worker processed ${processed} jobs`);

  // Keep draining until assemble done or failed (outline expands pages mid-run)
  for (let i = 0; i < 20; i++) {
    const jobs = await listJobsForVersion(
      enqueued.day,
      enqueued.version,
      enqueued.target_lang,
    );
    const summary = summarizeJobGraph(jobs);
    if (summary.status === 'done' || summary.status === 'failed') break;
    const n = await runWorkerBatch(workerId);
    if (n === 0) {
      // deps may still be unfinished — wait briefly
      await new Promise((r) => setTimeout(r, 500));
      const again = await runWorkerBatch(workerId);
      if (again === 0) break;
    }
  }

  const jobs = await getLatestJobsForDay(day);
  const summary = summarizeJobGraph(jobs);
  const lesson = await getLessonVersion(day, enqueued.version);

  console.log(
    JSON.stringify(
      {
        day: enqueued.day,
        version: enqueued.version,
        graph_status: summary.status,
        text_ready: summary.text_ready,
        flagged: lesson?.meta?.flagged ?? false,
        jobs: jobs.map((j) => ({
          kind: j.kind,
          page_id: j.page_id,
          status: j.status,
          over_budget: (j.progress as { over_budget?: boolean } | null)
            ?.over_budget,
          tokens: (j.progress as { tokens?: unknown } | null)?.tokens,
          error: j.error,
        })),
        pages: (lesson?.data?.pages as { id?: string }[] | undefined)?.map(
          (p) => p?.id,
        ),
      },
      null,
      2,
    ),
  );

  if (summary.status === 'failed') process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
