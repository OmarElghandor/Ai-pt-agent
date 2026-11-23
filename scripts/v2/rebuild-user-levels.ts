/**
 * Nightly rebuild of v2_user_level + question stats (16 §9.3 / E8).
 *
 *   npx tsx scripts/v2/rebuild-user-levels.ts
 *   npx tsx scripts/v2/rebuild-user-levels.ts --limit 50
 */
import { connectMongo, mongoConfigured } from '../../lib/mongo';
import { rebuildAllUserLevels } from '../../lib/v2/practice/levelJob';

async function main() {
  if (!mongoConfigured()) {
    console.error('MongoDB not configured');
    process.exit(1);
  }
  await connectMongo();
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;
  const result = await rebuildAllUserLevels({ limit });
  console.log(JSON.stringify({ ok: true, ...result }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
