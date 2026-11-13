import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2CustomDeckModel } from '@/lib/v2/mongo/models';
import { normaliseLemma } from './keys';

export type FoundPublicDeck = {
  id: string;
  title_tl: string;
  title_ar: string;
  word_count: number;
  added_count: number;
  tags: string[];
};

function topicTokens(topic: string): string[] {
  return topic
    .trim()
    .toLowerCase()
    .split(/[\s,،]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function matchesTopic(
  deck: {
    title_tl: string;
    title_ar: string;
    tags?: string[];
    topic?: string | null;
  },
  topic: string,
): boolean {
  const tokens = topicTokens(topic);
  if (tokens.length === 0) return false;
  const hay = [
    deck.title_tl,
    deck.title_ar,
    deck.topic ?? '',
    ...(deck.tags ?? []),
  ]
    .join(' ')
    .toLowerCase();
  // Also try normalised Latin title
  const hayNorm = normaliseLemma(deck.title_tl);
  return tokens.some(
    (t) => hay.includes(t) || hayNorm.includes(normaliseLemma(t)),
  );
}

/** Find existing public (non-promoted) decks for a topic — no model. */
export async function findExistingDecksForTopic(
  topic: string,
  opts?: { targetLang?: string; limit?: number },
): Promise<FoundPublicDeck[]> {
  if (!mongoConfigured()) return [];
  await connectMongo();
  const lang = opts?.targetLang ?? 'pt-PT';
  const limit = opts?.limit ?? 5;

  const docs = await V2CustomDeckModel()
    .find({
      target_lang: lang,
      visibility: 'public',
      status: 'custom',
    })
    .sort({ added_count: -1 })
    .limit(80)
    .lean();

  const out: FoundPublicDeck[] = [];
  for (const d of docs) {
    if (!matchesTopic(d, topic)) continue;
    out.push({
      id: String(d._id),
      title_tl: d.title_tl,
      title_ar: d.title_ar,
      word_count: (d.item_ids ?? []).length,
      added_count: d.added_count ?? 0,
      tags: d.tags ?? [],
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Pure matcher for tests. */
export function matchTopicAgainstDeck(
  deck: {
    title_tl: string;
    title_ar: string;
    tags?: string[];
    topic?: string | null;
  },
  topic: string,
): boolean {
  return matchesTopic(deck, topic);
}
