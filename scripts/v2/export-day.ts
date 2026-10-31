/**
 * Export latest lesson draft JSON for a day.
 * Usage: npx tsx scripts/v2/export-day.ts <day> [outfile]
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

async function main() {
  const day = Number(process.argv[2]);
  const out =
    process.argv[3] ?? resolve(process.cwd(), `tmp/day${day}-export.json`);
  if (!Number.isInteger(day) || day < 1) {
    console.error('Usage: npx tsx scripts/v2/export-day.ts <day> [outfile]');
    process.exit(1);
  }
  const { getLatestLesson } = await import(
    '@/lib/v2/generation/lesson/save'
  );
  const lesson = await getLatestLesson(day);
  if (!lesson) {
    console.error(`No lesson for day ${day}`);
    process.exit(1);
  }
  mkdirSync(dirname(out), { recursive: true });
  const payload = {
    day: lesson.day,
    version: lesson.version,
    status: lesson.status,
    target_lang: lesson.target_lang,
    meta: lesson.meta,
    pack: lesson.data,
  };
  writeFileSync(out, JSON.stringify(payload, null, 2) + '\n');
  const pages = lesson.data.pages ?? [];
  console.log(
    JSON.stringify(
      {
        path: out,
        day: lesson.day,
        version: lesson.version,
        status: lesson.status,
        flagged: lesson.meta?.flagged,
        text_ready: lesson.meta?.text_ready,
        pages: pages.map((p, i) => ({
          i,
          id: p.id,
          preset: p.preset,
          role: p.role,
          mode: p.mode,
          steps: p.steps?.length ?? 0,
          blocks: p.blocks.map((b) => b.type),
        })),
        questions: lesson.data.questions?.length ?? 0,
        items: lesson.data.items?.length ?? 0,
        timing_calls: lesson.meta?.timing?.length ?? 0,
        issue_count: lesson.meta?.issues?.length ?? 0,
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
