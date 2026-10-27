import type { Item } from '@/lib/v2/content/items';
import { transliteratePtToSay } from '@/lib/v2/content/translit';

type PhraseItem = Extract<Item, { type: 'phrase' }>;

const GENERIC_REPLIES: Array<{
  id: string;
  tl: string;
  ar: string;
  context_eg: string;
  cloze: string;
}> = [
  {
    id: 'phrase.yes_please',
    tl: 'Sim, por favor.',
    ar: 'نعم، من فضلك.',
    context_eg: 'لما حد يسألك عايز ولا لأ',
    cloze: 'Sim',
  },
  {
    id: 'phrase.no_thanks',
    tl: 'Não, obrigado.',
    ar: 'لا، شكرًا.',
    context_eg: 'لما ترفض بأدب',
    cloze: 'Não',
  },
];

function asPhrase(item: Item): PhraseItem | null {
  return item.type === 'phrase' ? (item as PhraseItem) : null;
}

function roleOf(item: Item): 'said' | 'heard' | undefined {
  const p = asPhrase(item);
  return p?.role;
}

/** Said phrases in bank that reply to a given heard id. */
export function saidRepliesFor(
  heardId: string,
  bank: Item[],
): PhraseItem[] {
  return bank
    .map(asPhrase)
    .filter((p): p is PhraseItem => Boolean(p))
    .filter(
      (p) =>
        p.role === 'said' &&
        (p.replies_to === heardId ||
          p.id === 'phrase.yes_please' ||
          p.id === 'phrase.no_thanks'),
    );
}

/**
 * Ensure every heard phrase has ≥1 said reply in bank ∪ known.
 * Injects up to `maxExtras` generic reply extras when needed.
 */
export function ensureHeardReplies(
  bank: Item[],
  opts?: { known?: Item[]; maxExtras?: number },
): { items: Item[]; injected: string[] } {
  const maxExtras = opts?.maxExtras ?? 2;
  const known = opts?.known ?? [];
  const byId = new Map<string, Item>();
  for (const i of [...known, ...bank]) byId.set(i.id, i);
  let items = [...bank];
  const injected: string[] = [];

  const existingExtras = items.filter(
    (i) =>
      Boolean((i as { extra?: boolean }).extra) &&
      !(i as { derived?: boolean }).derived,
  ).length;

  const heard = items.filter((i) => roleOf(i) === 'heard');
  for (const h of heard) {
    const pool = [...items, ...known];
    if (saidRepliesFor(h.id, pool).length > 0) continue;

    // Prefer linking an unused generic already in bank
    for (const g of GENERIC_REPLIES) {
      const existing = byId.get(g.id) ?? items.find((i) => i.id === g.id);
      if (existing && asPhrase(existing)) {
        const p = asPhrase(existing)!;
        if (!p.replies_to) {
          items = items.map((it) =>
            it.id === g.id
              ? ({ ...it, role: 'said', replies_to: h.id } as Item)
              : it,
          );
        }
        if (saidRepliesFor(h.id, items).length > 0) break;
      }
    }
    if (saidRepliesFor(h.id, [...items, ...known]).length > 0) continue;

    if (existingExtras + injected.length >= maxExtras) continue;

    const nextGeneric = GENERIC_REPLIES.find(
      (g) => !items.some((i) => i.id === g.id) && !byId.has(g.id),
    );
    if (!nextGeneric) continue;

    const phrase: PhraseItem = {
      type: 'phrase',
      id: nextGeneric.id,
      tl: nextGeneric.tl,
      ar: nextGeneric.ar,
      say: transliteratePtToSay(nextGeneric.tl),
      context_eg: nextGeneric.context_eg,
      cloze: nextGeneric.cloze,
      role: 'said',
      replies_to: h.id,
      extra: true,
    };
    items.push(phrase);
    byId.set(phrase.id, phrase);
    injected.push(phrase.id);
  }

  return { items, injected };
}

/** Pick a said reply id for a heard line (prefer replies_to match). */
export function pickReplyId(heardId: string, bank: Item[]): string | null {
  const replies = saidRepliesFor(heardId, bank);
  if (!replies.length) return null;
  const linked = replies.find((r) => r.replies_to === heardId);
  return (linked ?? replies[0])!.id;
}
