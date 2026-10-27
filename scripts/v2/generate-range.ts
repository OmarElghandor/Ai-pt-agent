/**
 * Generate a contiguous day range in order.
 * Day N waits for day N−1 assemble (day_digest) before starting.
 *
 * Usage:
 *   npx tsx scripts/v2/generate-range.ts --from 1 --to 3
 *
 * Message Batches (Anthropic) are NOT implemented yet. Pass --batch only to
 * see the reserved flag; generation still runs day-ordered via the live worker.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  enqueueGenerateLesson,
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

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  const pref = `${name}=`;
  const hit = args.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : undefined;
}

async function generateOneDay(day: number): Promise<{
  day: number;
  version: number;
  status: string;
}> {
  const enqueued = await enqueueGenerateLesson({ day });
  const workerId = `range-${process.pid}-${randomBytes(2).toString('hex')}`;
  for (let i = 0; i < 80; i++) {
    await runWorkerBatch(workerId);
    const jobs = await listJobsForVersion(
      enqueued.day,
      enqueued.version,
      enqueued.target_lang,
    );
    const summary = summarizeJobGraph(jobs);
    if (summary.status === 'done' || summary.status === 'failed') {
      return { day, version: enqueued.version, status: summary.status };
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return { day, version: enqueued.version, status: 'timeout' };
}

async function main() {
  const args = process.argv.slice(2);
  const from = Number(argValue(args, '--from') ?? args.find((a) => /^\d+$/.test(a)));
  const to = Number(argValue(args, '--to') ?? from);
  const wantBatch = args.includes('--batch') || process.env.V2_GEN_BATCHES === '1';

  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
    console.error(
      'Usage: npx tsx scripts/v2/generate-range.ts --from N --to M [--batch]',
    );
    process.exit(1);
  }

  if (wantBatch) {
    console.warn(
      '[v2:generate-range] --batch / V2_GEN_BATCHES reserved for Anthropic Message Batches; running day-ordered live worker instead.',
    );
  }

  console.info(
    `[v2:generate-range] days ${from}→${to} (ordered; each day waits on prior assemble)`,
  );

  const { getLatestLesson } = await import('@/lib/v2/generation/lesson/save');

  for (let day = from; day <= to; day++) {
    if (day > 1) {
      const latest = await getLatestLesson(day - 1);
      const digest = (
        latest?.meta as { handoffs?: { assemble?: unknown } } | undefined
      )?.handoffs?.assemble;
      if (!digest && latest?.meta?.text_ready !== true) {
        console.warn(
          `[v2:generate-range] day ${day - 1} has no day_digest yet; brief.yesterday will be null`,
        );
      } else {
        console.info(
          `[v2:generate-range] day ${day - 1} digest ready → starting day ${day}`,
        );
      }
    }

    console.info(`[v2:generate-range] generating day ${day}…`);
    const row = await generateOneDay(day);
    console.info(
      `[v2:generate-range] day ${row.day} v${row.version} status=${row.status}`,
    );
    if (row.status === 'failed' || row.status === 'timeout') {
      console.error('[v2:generate-range] stopping on failure');
      process.exit(1);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
