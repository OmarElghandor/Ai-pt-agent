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
  const { connectMongo } = await import('../../lib/mongo');
  const { V2LessonModel } = await import('../../lib/v2/mongo/models');
  await connectMongo();
  const rows = await V2LessonModel()
    .find({})
    .select({ day: 1, status: 1, version: 1 })
    .sort({ day: 1, version: -1 })
    .lean();
  const seen = new Set<number>();
  for (const r of rows) {
    if (seen.has(r.day)) continue;
    seen.add(r.day);
    console.log(`day ${r.day} v${r.version} ${r.status}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
