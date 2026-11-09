/**
 * Rekey v2_* documents from Langify user ids to v2 user ids.
 *
 * Usage:
 *   npx tsx scripts/v2/migrate-user-ids.ts           # dry run
 *   npx tsx scripts/v2/migrate-user-ids.ts --apply   # real run (idempotent)
 */
import { MongoClient } from 'mongodb';
import {
  USER_ID_FIELD,
  USER_KEYED_V2_COLLECTIONS,
} from '../../lib/v2/auth/userKeyedCollections';

async function main() {
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGODB_URI?.trim().replace(/^['"]|['"]$/g, '');
  if (!uri) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  const linked = await db
    .collection('v2_users')
    .find({ langify_user_id: { $exists: true, $nin: [null, ''] } })
    .project({ id: 1, langify_user_id: 1, email: 1 })
    .toArray();

  console.log(`Linked v2 users: ${linked.length}`);
  console.log(apply ? 'MODE: apply' : 'MODE: dry-run');

  const totals: Record<string, number> = {};

  for (const user of linked) {
    const v2Id = String(user.id);
    const langifyId = String(user.langify_user_id);
    if (!v2Id || !langifyId || v2Id === langifyId) continue;

    for (const coll of USER_KEYED_V2_COLLECTIONS) {
      const filter = { [USER_ID_FIELD]: langifyId };
      const count = await db.collection(coll).countDocuments(filter);
      totals[coll] = (totals[coll] ?? 0) + count;
      if (count === 0) continue;

      console.log(`  ${user.email ?? v2Id}: ${coll} ${count} docs (${langifyId} → ${v2Id})`);

      if (apply) {
        // Idempotent: only rewrite docs still on the Langify id.
        await db.collection(coll).updateMany(filter, { $set: { [USER_ID_FIELD]: v2Id } });
      }
    }
  }

  console.log('\nCounts that would move (or moved):');
  for (const coll of USER_KEYED_V2_COLLECTIONS) {
    console.log(`  ${coll}: ${totals[coll] ?? 0}`);
  }

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
