/**
 * Requeue failed jobs for a day/version and drain the worker.
 * Usage: npx tsx scripts/v2/resume-day.ts <day> [version]
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { connectMongo } from '@/lib/mongo';
import { V2JobModel } from '@/lib/v2/mongo/models';
import {
  getLatestJobsForDay,
  listJobsForVersion,
  runWorkerBatch,
  summarizeJobGraph,
} from '@/lib/v2/generation/jobs';

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
  const versionArg = process.argv[3] ? Number(process.argv[3]) : undefined;
  if (!Number.isInteger(day) || day < 1) {
    console.error('Usage: npx tsx scripts/v2/resume-day.ts <day> [version]');
    process.exit(1);
  }

  await connectMongo();
  const target_lang = 'pt-PT';
  let version = versionArg;
  if (!version) {
    const latest = await getLatestJobsForDay(day, target_lang);
    version = latest[0]?.version;
  }
  if (!version) {
    console.error('No jobs found');
    process.exit(1);
  }

  const failed = await V2JobModel().find({
    day,
    version,
    target_lang,
    status: 'failed',
  });
  for (const j of failed) {
    await V2JobModel().updateOne(
      { _id: j._id },
      {
        $set: { status: 'queued' },
        $unset: { error: 1, worker_id: 1, lease_expires_at: 1 },
      },
    );
    console.log('requeued', j.kind, j.page_id ?? j.page_index);
  }

  const workerId = `cli-${process.pid}-${randomBytes(3).toString('hex')}`;
  for (let i = 0; i < 25; i++) {
    const n = await runWorkerBatch(workerId);
    const jobs = await listJobsForVersion(day, version, target_lang);
    const summary = summarizeJobGraph(jobs);
    console.log(`batch ${i}: processed=${n} status=${summary.status}`);
    if (summary.status === 'done' || summary.status === 'failed') break;
    if (n === 0) await new Promise((r) => setTimeout(r, 500));
  }

  const jobs = await listJobsForVersion(day, version, target_lang);
  console.log(
    JSON.stringify(
      {
        day,
        version,
        graph_status: summarizeJobGraph(jobs).status,
        jobs: jobs.map((j) => ({
          kind: j.kind,
          page_id: j.page_id,
          status: j.status,
          error: j.error ?? null,
        })),
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
