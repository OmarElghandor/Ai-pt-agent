import {
  loadConvoItemSurfaces,
  requireConvoPackAsync,
  type ConvoPackData,
} from '@/lib/v2/convo/pack';
import { matchPackItemQuestion } from '@/lib/v2/convo/sideChannel/matchPackItem';
import { loadTopicsFile } from '@/lib/v2/convo/topics';
import { freeTopicIdForPack } from '@/lib/v2/convo/topics/lessonFreeBridge';

export type LearnSuggestHit = {
  groupKey: string;
  topicTitleAr: string;
  packId: string;
  talkHref: string;
};

/** Find a Module A pack linked to this free topic (or the first unlocked pack). */
export async function packForFreeTopic(
  freeTopicId: string | null,
): Promise<{ pack: ConvoPackData; packId: string; title_ar: string } | null> {
  const file = loadTopicsFile();
  for (const theme of file.themes) {
    for (const topic of theme.topics) {
      const linked = freeTopicIdForPack(topic.pack_id);
      if (freeTopicId && linked !== freeTopicId && topic.pack_id !== freeTopicId) {
        continue;
      }
      try {
        const pack = await requireConvoPackAsync(topic.pack_id, {
          itemSurfaces: loadConvoItemSurfaces(),
        });
        return {
          pack,
          packId: topic.pack_id,
          title_ar: topic.title_ar || theme.title_ar,
        };
      } catch {
        continue;
      }
    }
  }
  // Fallback: first pack that loads
  for (const theme of file.themes) {
    for (const topic of theme.topics) {
      try {
        const pack = await requireConvoPackAsync(topic.pack_id, {
          itemSurfaces: loadConvoItemSurfaces(),
        });
        return {
          pack,
          packId: topic.pack_id,
          title_ar: topic.title_ar || theme.title_ar,
        };
      } catch {
        continue;
      }
    }
  }
  return null;
}

/**
 * Match an Arabic language question to a pack item group.
 * Returns null when nothing matches (no suggestion).
 */
export async function matchLearnSuggest(
  learnerText: string,
  freeTopicId: string | null,
): Promise<LearnSuggestHit | null> {
  const found = await packForFreeTopic(freeTopicId);
  if (!found) return null;
  const surfaces = loadConvoItemSurfaces();
  const match = matchPackItemQuestion(learnerText, found.pack, surfaces);
  if (!match || match.kind !== 'item') return null;

  // Group by pack group containing the item
  let groupKey = match.item_id;
  for (const g of found.pack.groups) {
    if (g.item_ids.includes(match.item_id)) {
      groupKey = g.id;
      break;
    }
  }

  return {
    groupKey: `${found.packId}:${groupKey}`,
    topicTitleAr: found.title_ar,
    packId: found.packId,
    talkHref: `/talk/${encodeURIComponent(found.packId)}`,
  };
}

export function learnSuggestCoachEg(topicTitleAr: string): string {
  return `شكلك محتاج تفهم ${topicTitleAr} — تحب ندخل اتعلّم؟`;
}
