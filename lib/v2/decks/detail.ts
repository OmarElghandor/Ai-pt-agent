import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  V2CustomDeckModel,
  V2CustomItemModel,
  V2ItemStateModel,
  V2OfficialDeckModel,
  V2UserDeckModel,
} from '@/lib/v2/mongo/models';
import { getDeckDetail, type DeckDetail, type DeckItemRow } from './curriculum';
import { isCustomItemId } from './keys';

export async function getAnyDeckDetail(opts: {
  user_id: string;
  deckId: string;
  currentDay: number;
}): Promise<DeckDetail | null> {
  if (
    opts.deckId.startsWith('custom:') ||
    opts.deckId.startsWith('official:') ||
    /^[a-f0-9]{24}$/i.test(opts.deckId)
  ) {
    return getUgCDeckDetail(opts);
  }
  return getDeckDetail(opts);
}

async function getUgCDeckDetail(opts: {
  user_id: string;
  deckId: string;
  currentDay: number;
}): Promise<DeckDetail | null> {
  if (!mongoConfigured()) return null;
  await connectMongo();

  let kind: 'custom' | 'official' = 'custom';
  let id = opts.deckId;
  if (opts.deckId.startsWith('custom:')) {
    id = opts.deckId.slice('custom:'.length);
    kind = 'custom';
  } else if (opts.deckId.startsWith('official:')) {
    id = opts.deckId.slice('official:'.length);
    kind = 'official';
  }

  let title_tl = '';
  let title_ar = '';
  let item_ids: string[] = [];
  let added_count = 0;

  if (kind === 'custom') {
    const deck = await V2CustomDeckModel().findById(id).lean();
    if (!deck) return null;
    // Promoted decks leave من المتعلمين but owners/adders can still open
    title_tl = deck.title_tl;
    title_ar = deck.title_ar;
    item_ids = deck.item_ids ?? [];
    added_count = deck.added_count ?? 0;
  } else {
    const deck = await V2OfficialDeckModel().findById(id).lean();
    if (!deck || deck.status !== 'published') return null;
    title_tl = deck.title_tl;
    title_ar = deck.title_ar;
    item_ids = deck.item_ids ?? [];
  }

  const [states, userDeck, customItems] = await Promise.all([
    V2ItemStateModel()
      .find({ user_id: opts.user_id, item_id: { $in: item_ids } })
      .lean(),
    V2UserDeckModel()
      .findOne({ user_id: opts.user_id, deck_id: id })
      .lean(),
    V2CustomItemModel()
      .find({ id: { $in: item_ids.filter(isCustomItemId) } })
      .lean(),
  ]);
  const stateById = new Map(
    states.map((s) => [String(s.item_id), s] as const),
  );
  const tlById = new Map(customItems.map((c) => [c.id, c.tl] as const));

  const items: DeckItemRow[] = item_ids.map((item_id) => {
    const st = stateById.get(item_id);
    const mastered = st?.card?.masteryLevel === 'mastered';
    return {
      item_id,
      tl: tlById.get(item_id) ?? item_id,
      type: 'word',
      status: mastered ? 'graduated' : st ? 'reviewing' : 'new',
    };
  });

  const graduated = items.filter((i) => i.status === 'graduated').length;

  return {
    id: `${kind}:${id}`,
    kind,
    title_tl,
    title_ar,
    total: items.length,
    today: items.length - graduated,
    graduated,
    items,
    added: Boolean(userDeck),
    added_count,
    reportable: kind === 'custom',
  };
}
