/**
 * v2 background worker — claims DAG lesson jobs (concurrency via V2_JOB_CONCURRENCY).
 * Usage: npm run v2:worker
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { mongoConfigured } from '@/lib/mongo';
import {
  jobConcurrency,
  reclaimExpiredLeases,
  runWorkerBatch,
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

const POLL_MS = Number(process.env.V2_WORKER_POLL_MS) || 2000;
const workerId = `w-${process.pid}-${randomBytes(3).toString('hex')}`;

let stopping = false;

async function loop() {
  if (!mongoConfigured()) {
    console.error('[v2-worker] MongoDB not configured');
    process.exit(1);
  }

  console.info(
    `[v2-worker] started ${workerId} concurrency=${jobConcurrency()}`,
  );
  await reclaimExpiredLeases();

  while (!stopping) {
    try {
      const n = await runWorkerBatch(workerId);
      if (n === 0) {
        await sleep(POLL_MS);
      }
    } catch (err) {
      console.error('[v2-worker] loop error', err);
      await sleep(POLL_MS);
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

process.on('SIGINT', () => {
  stopping = true;
  console.info('[v2-worker] shutting down…');
});
process.on('SIGTERM', () => {
  stopping = true;
});

loop().catch((err) => {
  console.error(err);
  process.exit(1);
});
