import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
  const { connectMongo } = await import('@/lib/mongo');
  await connectMongo();
  const { getLatestLesson } = await import('@/lib/v2/generation/lesson/save');
  const { validateLessonPack } = await import('@/lib/v2/content/validate');
  const lesson = await getLatestLesson(1);
  if (!lesson) {
    console.log('none');
    return;
  }
  const v = validateLessonPack(lesson.data, { mode: 'strict' });
  for (const i of v.issues.filter((x) => x.severity === 'error')) {
    console.log(`${i.rule}\t${i.path}\t${i.message}`);
  }
  console.log('--- pages ---');
  for (const p of lesson.data.pages) {
    console.log(
      p.id,
      p.preset,
      p.role,
      'steps',
      p.steps?.length,
      'blocks',
      p.blocks.map((b) => b.type).join(','),
    );
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
