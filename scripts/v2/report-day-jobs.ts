/**
 * Print per-job table for a day version.
 * Usage: npx tsx scripts/v2/report-day-jobs.ts --day 2
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2JobModel } from '@/lib/v2/mongo/models';

function loadEnv(name: string) {
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

loadEnv('.env.local');
loadEnv('.env');

async function main() {
  const dayArg = process.argv.find((a) => a.startsWith('--day='));
  const day =
    Number(dayArg?.slice(6) ?? process.argv[process.argv.indexOf('--day') + 1]) ||
    2;
  if (!mongoConfigured()) throw new Error('Mongo not configured');
  await connectMongo();
  const verArg = process.argv.find((a) => a.startsWith('--version='));
  let v =
    verArg != null
      ? Number(verArg.slice(10))
      : undefined;
  if (v == null || !Number.isFinite(v)) {
    const assembled = await V2JobModel()
      .find({ day, kind: 'assemble', status: 'done' })
      .sort({ version: -1 })
      .limit(1)
      .lean();
    v = assembled[0]?.version;
  }
  if (v == null) {
    const latest = await V2JobModel()
      .find({ day })
      .sort({ version: -1 })
      .limit(1)
      .lean();
    v = latest[0]?.version;
  }
  if (v == null) {
    console.log('no jobs for day', day);
    process.exit(1);
  }
  const jobs = await V2JobModel()
    .find({ day, version: v })
    .sort({ kind: 1, page_index: 1 })
    .lean();
  console.log(`# Day ${day} version ${v}\n`);
  console.log(
    '| job | status | retries | auto_fix | warnings | tokens in/out | ms |',
  );
  console.log('|---|---|---:|---:|---|---:|---:|');
  for (const j of jobs) {
    const label = j.page_id ? `${j.kind}:${j.page_id}` : j.kind;
    const prog = (j.progress ?? {}) as Record<string, unknown>;
    const retries =
      (prog.retries as number | undefined) ??
      (Array.isArray(j.attempts) ? Math.max(0, j.attempts.length - 1) : 0);
    const fixes = (prog.auto_fix_count as number | undefined) ?? 0;
    const warnList = Array.isArray(prog.warnings)
      ? (prog.warnings as { rule?: string }[])
          .map((w) => w.rule ?? '?')
          .slice(0, 5)
          .join('; ')
      : Array.isArray(j.issues)
        ? (j.issues as unknown[])
            .slice(0, 3)
            .map((i) =>
              typeof i === 'string'
                ? i.split(':')[0]
                : String((i as { rule?: string }).rule ?? i),
            )
            .join('; ')
        : '—';
    const t = (j.tokens ?? prog.tokens ?? {}) as {
      input?: number;
      output?: number;
    };
    const timing = prog.timing as { duration_ms?: number } | undefined;
    let ms: number | string = timing?.duration_ms ?? '—';
    if (
      ms === '—' &&
      j.started_at &&
      j.finished_at
    ) {
      ms =
        new Date(j.finished_at as Date).getTime() -
        new Date(j.started_at as Date).getTime();
    }
    console.log(
      `| ${label} | ${j.status} | ${retries} | ${fixes} | ${warnList || '—'} | ${t.input ?? '—'}/${t.output ?? '—'} | ${ms} |`,
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
