/**
 * Report critic + lang_check outcomes for a day.
 * Usage: npx tsx scripts/v2/report-critic-lang.ts --day 2
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2JobModel } from '@/lib/v2/mongo/models';
import { getLatestLesson } from '@/lib/v2/generation/lesson/save';

function loadEnv(name: string) {
  const path = resolve(process.cwd(), name);
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const eq = line.indexOf('=');
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
  const lesson = await getLatestLesson(day);
  const v = lesson?.version;
  if (v == null) {
    console.log(JSON.stringify({ day, error: 'no lesson' }));
    process.exit(1);
  }
  const jobs = await V2JobModel().find({ day, version: v }).lean();
  const critics = jobs.filter((j) => j.kind === 'critic');
  const lang = jobs.find((j) => j.kind === 'lang_check');
  const pages = jobs.filter((j) => j.kind === 'page');
  const blockRegens = pages.filter((j) =>
    String((j.progress as { issues?: string[] } | null)?.issues ?? '').includes(
      'block',
    ) ||
    JSON.stringify(j.output ?? {}).includes('block_regen') ||
    JSON.stringify(j.issues ?? {}).includes('block_regen'),
  );
  const out = {
    day,
    version: v,
    text_ready: lesson?.meta?.text_ready ?? null,
    flagged: lesson?.meta?.flagged ?? null,
    critic_regen: lesson?.meta?.critic_regen ?? null,
    critic_block_targets: lesson?.meta?.critic_block_targets ?? null,
    critics: critics.map((j) => ({
      page: j.page_id,
      status: j.status,
      issues: j.issues ?? [],
      progress_issues: (j.progress as { issues?: unknown } | null)?.issues ?? null,
    })),
    block_regen_pages: blockRegens.map((j) => j.page_id),
    lang_check: {
      status: lang?.status ?? null,
      output: lang?.output ?? null,
      issues: lang?.issues ?? null,
    },
    meta_lang_check: lesson?.meta?.lang_check ?? null,
  };
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
