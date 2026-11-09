import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2ItemStateModel } from '@/lib/v2/mongo/models';
import type { ItemState } from '@/lib/v2/progress/types';

function docToState(doc: Record<string, unknown>): ItemState {
  const card = (doc.card ?? {}) as Record<string, unknown>;
  const levels = (doc.levels ?? {}) as Record<string, number>;
  return {
    user_id: String(doc.user_id),
    item_id: String(doc.item_id),
    target_lang: String(doc.target_lang ?? 'pt-PT'),
    introducedDay: Number(doc.introducedDay ?? 1),
    usedCorrectlyIn: Array.isArray(doc.usedCorrectlyIn)
      ? (doc.usedCorrectlyIn as string[])
      : [],
    levels: {
      heard: levels.heard ?? 0,
      understood: levels.understood ?? 0,
      said: levels.said ?? 0,
      used: levels.used ?? 0,
    },
    skills: (doc.skills as ItemState['skills']) ?? {},
    card: {
      interval: Number(card.interval ?? 0),
      dueAt: card.dueAt
        ? new Date(card.dueAt as string | Date).toISOString()
        : null,
      masteryLevel:
        card.masteryLevel === 'mastered' ? 'mastered' : 'learning',
      consecutiveCorrect: Number(card.consecutiveCorrect ?? 0),
      face: String(card.face ?? 'recognize'),
      knowCheckDueAt: card.knowCheckDueAt
        ? new Date(card.knowCheckDueAt as string | Date).toISOString()
        : null,
    },
    lastImplicitReviewLocalDate:
      (doc.lastImplicitReviewLocalDate as string | null) ?? null,
    weakToolIds: Array.isArray(doc.weakToolIds)
      ? (doc.weakToolIds as string[])
      : [],
    opt_in_card: Boolean(doc.opt_in_card),
  };
}

/** Bulk-load item states for a user (optional id filter). */
export async function loadItemStatesById(
  userId: string,
  itemIds?: string[],
): Promise<Map<string, ItemState>> {
  const map = new Map<string, ItemState>();
  if (!mongoConfigured()) return map;
  await connectMongo();
  const filter: Record<string, unknown> = { user_id: userId };
  if (itemIds && itemIds.length > 0) {
    filter.item_id = { $in: itemIds };
  }
  const docs = await V2ItemStateModel().find(filter).lean();
  for (const doc of docs) {
    const state = docToState(doc as Record<string, unknown>);
    map.set(state.item_id, state);
  }
  return map;
}
