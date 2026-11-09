import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2ItemStateModel } from '@/lib/v2/mongo/models';
import {
  loadConvoItemSurfaces,
  surfaceTlFor,
} from '@/lib/v2/convo/pack';
import { getCoreItemsDay } from '@/lib/v2/generation/lesson/coreItems';
import { getDayPlan } from '@/lib/v2/generation/lesson/plan';
import { loadWeakItemIds } from '@/lib/v2/progress/weakItems';

const MAX_SUGGESTED = 15;

/** Core-item TLS for open mode while a day is preparing (P4). */
export function suggestedWordsForDay(
  day: number,
  limit: number = MAX_SUGGESTED,
): string[] {
  try {
    const core = getCoreItemsDay(day);
    const words: string[] = [];
    const seen = new Set<string>();
    for (const item of core.core_items) {
      const tl = item.tl?.trim();
      if (!tl) continue;
      const key = tl.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      words.push(tl);
      if (words.length >= limit) break;
    }
    return words;
  } catch {
    return [];
  }
}

/** Egyptian situation line for the day (coach context). */
export function situationEgForDay(day: number): string | null {
  try {
    const plan = getDayPlan(day);
    return plan.situation_eg?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Up to 15 tl surfaces from the learner's weak + recently updated items.
 * Used as open-mode `suggested_words` (not opening topic chips).
 */
export async function loadSuggestedSurfacesForUser(
  userId: string,
  limit: number = MAX_SUGGESTED,
): Promise<string[]> {
  if (!userId || !mongoConfigured()) return [];

  await connectMongo();
  const [weakIds, recentDocs] = await Promise.all([
    loadWeakItemIds(userId),
    V2ItemStateModel()
      .find({ user_id: userId })
      .sort({ updatedAt: -1 })
      .limit(40)
      .select('item_id')
      .lean(),
  ]);

  const orderedIds: string[] = [];
  const seen = new Set<string>();
  for (const id of weakIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    orderedIds.push(id);
  }
  for (const doc of recentDocs) {
    const id = String(doc.item_id ?? '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    orderedIds.push(id);
  }

  const surfaces = loadConvoItemSurfaces();
  const words: string[] = [];
  const wordSeen = new Set<string>();
  for (const id of orderedIds) {
    const tl = surfaceTlFor(surfaces, id).trim();
    if (!tl) continue;
    const key = tl.toLowerCase();
    if (wordSeen.has(key)) continue;
    wordSeen.add(key);
    words.push(tl);
    if (words.length >= limit) break;
  }
  return words;
}
