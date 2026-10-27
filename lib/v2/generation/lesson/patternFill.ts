import type { Item, PatternSlot } from '@/lib/v2/content/items';
import { transliteratePtToSay } from '@/lib/v2/content/translit';
import type { CoreItem } from './coreItems';

type WordItem = Extract<Item, { type: 'word' }>;
type PatternItem = Extract<Item, { type: 'pattern' }>;

function isHole(
  slot: PatternSlot,
): slot is Extract<PatternSlot, { name_eg: string }> {
  return slot != null && typeof slot === 'object' && 'name_eg' in slot;
}

function articleFor(
  kind: 'article_um_uma' | 'article_o_a',
  gender: 'm' | 'f' | 'n' | undefined,
): string {
  const g = gender === 'f' ? 'f' : 'm';
  if (kind === 'article_um_uma') return g === 'f' ? 'uma' : 'um';
  return g === 'f' ? 'a' : 'o';
}

function stripArticlePrefix(tl: string): string {
  return tl.replace(/^(o|a|os|as|um|uma|uns|umas)\s+/i, '').trim() || tl;
}

/** Fixed Portuguese slot → simple MSA fragment for derived ar. */
const FIXED_SLOT_AR: Record<string, string> = {
  queria: 'أريد',
  'por favor': 'من فضلك',
  'por favor.': 'من فضلك.',
  ', por favor.': '، من فضلك.',
  ', por favor': '، من فضلك',
};

function fixedSlotAr(tl: string): string {
  const key = tl.trim().toLowerCase().replace(/\s+/g, ' ');
  if (FIXED_SLOT_AR[key]) return FIXED_SLOT_AR[key]!;
  const bare = key.replace(/^,\s*/, '').replace(/[.!?,]+$/, '');
  if (FIXED_SLOT_AR[bare]) {
    const base = FIXED_SLOT_AR[bare]!;
    if (tl.trim().startsWith(',')) return `، ${base.replace(/^،\s*/, '')}`;
    return base;
  }
  return '';
}

function hasIndefiniteArticle(slots: PatternSlot[]): boolean {
  return slots.some(
    (s) => isHole(s) && (s.kind ?? 'word') === 'article_um_uma',
  );
}

function hasPoliteTail(slots: PatternSlot[]): boolean {
  return slots.some(
    (s) => !isHole(s) && /por favor/i.test(s.tl),
  );
}

function stripAl(ar: string): string {
  return ar.replace(/^ال/, '').trim() || ar;
}

function composeExampleTl(slots: PatternSlot[], word: WordItem): string {
  const hasArticleSlot = slots.some(
    (s) =>
      isHole(s) &&
      (s.kind === 'article_um_uma' || s.kind === 'article_o_a'),
  );
  const polite = hasPoliteTail(slots);
  const parts: string[] = [];
  for (const slot of slots) {
    if (!isHole(slot)) {
      if (/por favor/i.test(slot.tl)) continue; // re-append consistently below
      parts.push(slot.tl);
      continue;
    }
    const kind = slot.kind ?? 'word';
    if (kind === 'word') {
      if (!hasArticleSlot) {
        parts.push(articleFor('article_um_uma', word.gender));
      }
      parts.push(stripArticlePrefix(word.tl));
    } else if (kind === 'article_um_uma' || kind === 'article_o_a') {
      parts.push(articleFor(kind, word.gender));
    }
  }
  let tl = parts
    .join(' ')
    .replace(/\s+([,.!?…])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (polite) {
    tl = `${tl.replace(/,?\s*por favor\.?\s*$/i, '').trim()}, por favor.`;
  }
  return tl;
}

function composeExampleAr(slots: PatternSlot[], word: WordItem): string {
  let meaning = word.ar?.trim() || word.tl;
  // Indefinite um/uma → strip ال from the filled word meaning
  if (hasIndefiniteArticle(slots)) meaning = stripAl(meaning);
  const polite = hasPoliteTail(slots);
  const parts: string[] = [];
  for (const slot of slots) {
    if (!isHole(slot)) {
      if (/por favor/i.test(slot.tl)) continue;
      const ar = fixedSlotAr(slot.tl);
      if (ar) parts.push(ar);
      continue;
    }
    const kind = slot.kind ?? 'word';
    if (kind === 'word') {
      parts.push(meaning);
    }
  }
  let ar = parts.length
    ? parts
        .join(' ')
        .replace(/\s+([,.!?…،])/g, '$1')
        .replace(/\s{2,}/g, ' ')
        .trim()
    : meaning;
  if (polite) {
    ar = `${ar.replace(/،?\s*من فضلك\.?\s*$/u, '').trim()}، من فضلك`;
  }
  return ar;
}

/** Exported for unit tests. */
export function composePatternExample(
  slots: PatternSlot[],
  word: WordItem,
): { tl: string; ar: string } {
  return {
    tl: composeExampleTl(slots, word),
    ar: composeExampleAr(slots, word),
  };
}

function exampleId(patternId: string, n: number): string {
  return `${patternId}.ex.${n}`;
}

/**
 * Code-owned pattern completion:
 * - fills word holes from core.fills when present, else today's word items
 * - builds 3–4 derived phrase examples pattern.<x>.ex.<n> with derived=true
 */
export function fillPatternsInBank(
  bank: Item[],
  opts?: { coreItems?: CoreItem[] },
): Item[] {
  const words = bank.filter((i): i is WordItem => i.type === 'word');
  const wordById = new Map(words.map((w) => [w.id, w]));
  const coreFills = new Map<string, string[]>();
  for (const c of opts?.coreItems ?? []) {
    if (c.kind === 'pattern' && Array.isArray(c.fills) && c.fills.length) {
      coreFills.set(c.id, c.fills);
    }
  }
  if (!words.length && !coreFills.size) return bank;

  const derived: Item[] = [];
  const next = bank.map((item) => {
    if (item.type !== 'pattern') return item;
    const pattern = item as PatternItem;
    const fillIds =
      coreFills.get(pattern.id)?.filter((id) => wordById.has(id)) ??
      words.map((w) => w.id);
    if (!fillIds.length) return item;

    let slots = (pattern.slots ?? []).map((slot) => {
      if (!isHole(slot)) return slot;
      const kind = slot.kind ?? 'word';
      if (kind === 'word') {
        return {
          ...slot,
          kind,
          fills: fillIds.slice(0, Math.max(4, fillIds.length)),
        };
      }
      return { ...slot, kind, fills: undefined };
    }) as PatternSlot[];

    const hasArticle = slots.some(
      (s) =>
        isHole(s) &&
        (s.kind === 'article_um_uma' || s.kind === 'article_o_a'),
    );
    const wordIdx = slots.findIndex(
      (s) => isHole(s) && (s.kind ?? 'word') === 'word',
    );
    if (!hasArticle && wordIdx >= 0) {
      slots = [
        ...slots.slice(0, wordIdx),
        { name_eg: 'أداة', kind: 'article_um_uma' as const },
        ...slots.slice(wordIdx),
      ];
    }

    const pickCount = Math.min(4, Math.max(3, Math.min(fillIds.length, 4)));
    const chosen = fillIds
      .slice(0, pickCount)
      .map((id) => wordById.get(id))
      .filter((w): w is WordItem => Boolean(w));
    const exampleIds: string[] = [];

    for (const [i, word] of chosen.entries()) {
      const n = i + 1;
      const id = exampleId(pattern.id, n);
      exampleIds.push(id);
      const tl = composeExampleTl(slots, word);
      const ar = composeExampleAr(slots, word);
      const cloze =
        tl.replace(/[…!.?,]+$/g, '').trim().split(/\s+/)[0] ?? word.tl;
      derived.push({
        type: 'phrase',
        id,
        tl,
        ar,
        say: transliteratePtToSay(tl),
        context_eg: 'مثال على التركيبة',
        cloze,
        derived: true,
      } as Item);
    }

    if (!exampleIds.length) return { ...pattern, slots } as Item;

    return {
      ...pattern,
      slots,
      examples: exampleIds,
    } as Item;
  });

  const derivedIds = new Set(derived.map((d) => d.id));
  const cleaned = next.filter((i) => {
    if (derivedIds.has(i.id)) return false;
    if (
      i.type === 'phrase' &&
      /^pattern\..+\.ex\.\d+$/.test(i.id) &&
      next.some(
        (p) => p.type === 'pattern' && i.id.startsWith(`${p.id}.ex.`),
      )
    ) {
      return false;
    }
    return true;
  });

  return [...cleaned, ...derived];
}

/** Minimal pattern stub when PAGE_PLAN needs one and the model omitted it. */
export function ensurePatternSkeleton(
  bank: Item[],
  opts?: { coreItems?: CoreItem[] },
): Item[] {
  if (bank.some((it) => it.type === 'pattern')) {
    return fillPatternsInBank(bank, opts);
  }
  const words = bank.filter((i) => i.type === 'word');
  if (!words.length) return bank;
  const pattern: Item = {
    type: 'pattern',
    id: 'pattern.day',
    slots: [
      { tl: 'Queria' },
      { name_eg: 'أداة', kind: 'article_um_uma' },
      { name_eg: 'الحاجة', kind: 'word' },
      { tl: ', por favor.' },
    ],
    examples: ['pattern.day.ex.1'],
  } as Item;
  return fillPatternsInBank([...bank, pattern], opts);
}

/** Strip polite tail for writing accepted variants. */
export function stripPoliteTail(tl: string): string {
  return tl
    .replace(/,?\s*por favor\.?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}
