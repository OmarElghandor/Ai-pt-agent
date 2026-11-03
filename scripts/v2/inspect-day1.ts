import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv(n: string) {
  const p = resolve(process.cwd(), n);
  if (!existsSync(p)) return;
  for (const raw of readFileSync(p, 'utf8').split('\n')) {
    const l = raw.trim();
    if (!l || l.startsWith('#')) continue;
    const eq = l.indexOf('=');
    if (eq <= 0) continue;
    const k = l.slice(0, eq).trim();
    if (!k || process.env[k] !== undefined) continue;
    let v = l.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
}
loadEnv('.env.local');
loadEnv('.env');

async function main() {
  const { connectMongo } = await import('@/lib/mongo');
  await connectMongo();
  const { getLatestLesson } = await import('@/lib/v2/generation/lesson/save');
  const l = await getLatestLesson(1);
  const d = l?.data as Record<string, unknown> | undefined;
  const outline = d?.outline as { pages?: unknown[] } | undefined;
  console.log(
    JSON.stringify(
      {
        version: l?.version,
        status: l?.status,
        items: Array.isArray(d?.items) ? d!.items.length : 0,
        pages: Array.isArray(d?.pages) ? (d!.pages as unknown[]).length : 0,
        questions: Array.isArray(d?.questions)
          ? (d!.questions as unknown[]).length
          : 0,
        outlinePages: outline?.pages?.length ?? 0,
        dataKeys: Object.keys(d ?? {}),
        metaKeys: Object.keys(l?.meta ?? {}),
        handoffKeys: Object.keys(
          ((l?.meta as { handoffs?: Record<string, unknown> } | undefined)
            ?.handoffs ?? {}) as object,
        ),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
