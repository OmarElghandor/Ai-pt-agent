import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2ErrorModel } from '@/lib/v2/mongo/models';
import type { ProgressError } from './types';
import { weakItemIdsFromErrors } from './weakAreas';

/** Item ids the Phase 4 weak-area rule currently marks weak. Read-only. */
export async function loadWeakItemIds(userId: string): Promise<Set<string>> {
  if (!mongoConfigured()) return new Set();
  await connectMongo();
  const rows = await V2ErrorModel()
    .find({ user_id: userId })
    .sort({ at: 1 })
    .select('item_id tool_id skill category scope wrong right at')
    .lean();
  const errors: ProgressError[] = rows.map((r) => ({
    user_id: userId,
    item_id: r.item_id ?? undefined,
    tool_id: r.tool_id ?? undefined,
    skill: (r.skill as ProgressError['skill']) ?? undefined,
    category: r.category as ProgressError['category'],
    scope: r.scope,
    wrong: r.wrong,
    right: r.right,
    at: new Date(r.at).toISOString(),
  }));
  return weakItemIdsFromErrors(errors);
}
