/**
 * Regression: generate fixed sample days and print issue/token table.
 * Usage:
 *   npm run v2:gen-sample
 *   npm run v2:gen-sample -- --profile qwen-light
 *   npm run v2:gen-sample -- --profile qwen-all
 *   npm run v2:gen-sample -- --profile claude
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
import { getLessonVersion } from '@/lib/v2/generation/lesson/save';
import {
  setModelProfile,
  type ModelProfile,
} from '@/lib/v2/generation/lesson/models';
import { V2GenSampleRunModel } from '@/lib/v2/mongo/models';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import type { Issue } from '@/lib/v2/content/validate';

const DEFAULT_SAMPLE_DAYS = [1, 2, 3, 6, 7] as const;

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

type DayRow = {
  day: number;
  version: number;
  status: string;
  flagged: boolean;
  ms: number;
  tokens_in: number;
  tokens_out: number;
  over_budget: number;
  cost_usd: number;
  issues_by_rule: Record<string, number>;
  tokens_by_kind: Record<string, { in: number; out: number; ms: number; usd: number }>;
  warnings: string[];
};

function parseProfile(args: string[]): ModelProfile {
  const i = args.indexOf('--profile');
  const raw =
    i >= 0
      ? args[i + 1]
      : args.find((a) => a.startsWith('--profile='))?.slice('--profile='.length);
  if (
    raw === 'qwen-light' ||
    raw === 'qwen-all' ||
    raw === 'claude' ||
    raw === 'default'
  ) {
    return raw;
  }
  return 'default';
}

function parseDays(args: string[]): number[] {
  const i = args.indexOf('--days');
  const raw =
    i >= 0
      ? args[i + 1]
      : args.find((a) => a.startsWith('--days='))?.slice('--days='.length);
  if (!raw) return [...DEFAULT_SAMPLE_DAYS];
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 90);
}

async function generateDay(day: number): Promise<DayRow> {
  const started = Date.now();
  const enqueued = await enqueueGenerateLesson({ day });
  const workerId = `sample-${process.pid}-${randomBytes(2).toString('hex')}`;
  for (let i = 0; i < 80; i++) {
    await runWorkerBatch(workerId, {
      day: enqueued.day,
      version: enqueued.version,
      targetLang: enqueued.target_lang,
    });
    const jobs = await listJobsForVersion(
      enqueued.day,
      enqueued.version,
      enqueued.target_lang,
    );
    const summary = summarizeJobGraph(jobs);
    if (summary.status === 'done' || summary.status === 'failed') break;
    await new Promise((r) => setTimeout(r, 400));
  }
  const jobs = await listJobsForVersion(
    enqueued.day,
    enqueued.version,
    enqueued.target_lang,
  );
  const summary = summarizeJobGraph(jobs);
  const lesson = await getLessonVersion(day, enqueued.version);
  const issues = (lesson?.meta?.issues ?? []) as Issue[];
  const issues_by_rule: Record<string, number> = {};
  for (const iss of issues) {
    issues_by_rule[iss.rule] = (issues_by_rule[iss.rule] ?? 0) + 1;
  }
  for (const j of jobs) {
    if (j.status === 'failed') {
      const key = `job_failed:${j.kind}`;
      issues_by_rule[key] = (issues_by_rule[key] ?? 0) + 1;
    }
  }
  const brief = (
    lesson?.meta as
      | { handoffs?: { brief?: { warnings?: string[] } } }
      | undefined
  )?.handoffs?.brief;
  const warnings = [...(brief?.warnings ?? [])];
  let tokens_in = 0;
  let tokens_out = 0;
  let over_budget = 0;
  let cost_usd = 0;
  const tokens_by_kind: DayRow['tokens_by_kind'] = {};
  for (const j of jobs) {
    const t = (j.tokens ??
      (j.progress as { tokens?: { input?: number; output?: number } } | null)
        ?.tokens) as
      | { input?: number; output?: number }
      | null
      | undefined;
    const ms =
      (j.progress as { timing?: { duration_ms?: number } } | null)?.timing
        ?.duration_ms ?? 0;
    const usd = j.usd_estimate ?? 0;
    tokens_in += t?.input ?? 0;
    tokens_out += t?.output ?? 0;
    cost_usd += usd;
    if (j.over_budget || (j.progress as { over_budget?: boolean } | null)?.over_budget) {
      over_budget += 1;
    }
    const kind = j.kind;
    const prev = tokens_by_kind[kind] ?? { in: 0, out: 0, ms: 0, usd: 0 };
    tokens_by_kind[kind] = {
      in: prev.in + (t?.input ?? 0),
      out: prev.out + (t?.output ?? 0),
      ms: prev.ms + ms,
      usd: prev.usd + usd,
    };
  }
  return {
    day,
    version: enqueued.version,
    status: summary.status,
    flagged: Boolean(lesson?.meta?.flagged),
    ms: Date.now() - started,
    tokens_in,
    tokens_out,
    over_budget,
    cost_usd: Math.round(cost_usd * 10_000) / 10_000,
    issues_by_rule,
    tokens_by_kind,
    warnings,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const profile = parseProfile(args);
  const sampleDays = parseDays(args);
  setModelProfile(profile);
  console.info(
    `[v2:gen-sample] profile=${profile} days=${sampleDays.join(',')}`,
  );

  const started_at = new Date();
  const rows: DayRow[] = [];
  for (const day of sampleDays) {
    console.info(`[v2:gen-sample] generating day ${day}…`);
    try {
      rows.push(await generateDay(day));
    } catch (err) {
      console.error(`[v2:gen-sample] day ${day} failed`, err);
      rows.push({
        day,
        version: 0,
        status: 'failed',
        flagged: true,
        ms: 0,
        tokens_in: 0,
        tokens_out: 0,
        over_budget: 0,
        cost_usd: 0,
        issues_by_rule: { exception: 1 },
        tokens_by_kind: {},
        warnings: [],
      });
    }
  }

  const allRules = [
    ...new Set(rows.flatMap((r) => Object.keys(r.issues_by_rule))),
  ].sort();
  console.info('\n## v2:gen-sample results\n');
  console.info(
    `| day | status | flagged | ms | in | out | over | usd | warnings | ${allRules.join(' | ')} |`,
  );
  console.info(
    `|---:|---|---|---:|---:|---:|---:|---:|---|${allRules.map(() => '---:').join('|')}|`,
  );
  for (const r of rows) {
    const counts = allRules.map((rule) => String(r.issues_by_rule[rule] ?? 0));
    console.info(
      `| ${r.day} | ${r.status} | ${r.flagged} | ${r.ms} | ${r.tokens_in} | ${r.tokens_out} | ${r.over_budget} | ${r.cost_usd} | ${r.warnings.join('; ') || '—'} | ${counts.join(' | ')} |`,
    );
  }

  const overTotal = rows.reduce((a, r) => a + r.over_budget, 0);
  console.info(
    `\n[v2:gen-sample] over_budget jobs total=${overTotal}${overTotal === 0 ? ' (all within budget)' : ''}`,
  );

  if (mongoConfigured()) {
    await connectMongo();
    const issues_by_rule: Record<string, number> = {};
    const tokens_by_kind: Record<string, { in: number; out: number }> = {};
    const time_by_kind: Record<string, number> = {};
    const cost_by_kind: Record<string, number> = {};
    for (const r of rows) {
      for (const [rule, n] of Object.entries(r.issues_by_rule)) {
        issues_by_rule[rule] = (issues_by_rule[rule] ?? 0) + n;
      }
      for (const [kind, t] of Object.entries(r.tokens_by_kind)) {
        const prev = tokens_by_kind[kind] ?? { in: 0, out: 0 };
        tokens_by_kind[kind] = {
          in: prev.in + t.in,
          out: prev.out + t.out,
        };
        time_by_kind[kind] = (time_by_kind[kind] ?? 0) + t.ms;
        cost_by_kind[kind] = (cost_by_kind[kind] ?? 0) + t.usd;
      }
    }
    await V2GenSampleRunModel().create({
      profile,
      started_at,
      finished_at: new Date(),
      days: rows,
      issues_by_rule,
      tokens_by_kind,
      time_by_kind,
      cost_by_kind,
      over_budget_count: overTotal,
      summary: {
        days: rows.length,
        flagged: rows.filter((r) => r.flagged).length,
        failed: rows.filter((r) => r.status === 'failed').length,
        warnings: rows.flatMap((r) =>
          r.warnings.map((w) => `day${r.day}:${w}`),
        ),
        time_by_kind,
      },
    });
    console.info('[v2:gen-sample] saved run to v2_gen_sample_runs');
  }

  process.exit(overTotal > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
