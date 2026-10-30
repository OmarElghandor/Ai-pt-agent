import type { Item, PatternSlot } from '@/lib/v2/content/items';
import { transliteratePtToSay } from '@/lib/v2/content/translit';
import type { CoreItem } from './coreItems';
import {
  resolvePatternKind,
  slotsForKind,
  type PatternKind,
} from './patternTemplates';

type WordItem = Extract<Item, { type: 'word' }>;
type PatternItem = Extract<Item, { type: 'pattern' }> & {
  kind?: PatternKind;
};

function isHole(
  slot: PatternSlot,
): slot is Extract<PatternSlot, { name_eg: string }> {
  return slot != null && typeof slot === 'object' && 'name_eg' in slot;
}

function articleFor(
  kind: 'article_um_uma' | 'article_o_a' | 'article_os_as',
  gender: 'm' | 'f' | 'n' | undefined,
): string {
  const g = gender === 'f' ? 'f' : 'm';
  if (kind === 'article_um_uma') return g === 'f' ? 'uma' : 'um';
  if (kind === 'article_os_as') return g === 'f' ? 'as' : 'os';
  return g === 'f' ? 'a' : 'o';
}

function stripArticlePrefix(tl: string): string {
  return tl.replace(/^(o|a|os|as|um|uma|uns|umas)\s+/i, '').trim() || tl;
}

function wordPluralTl(word: WordItem): string | null {
  const raw =
    (typeof word.plural_tl === 'string' && word.plural_tl.trim()) ||
    (typeof word.plural === 'string' && word.plural.trim()) ||
    '';
  if (!raw) return null;
  return stripArticlePrefix(raw);
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
  return slots.some((s) => !isHole(s) && /por favor/i.test(s.tl));
}

function stripAl(ar: string): string {
  return ar.replace(/^ال/, '').trim() || ar;
}

function composeExampleTl(slots: PatternSlot[], word: WordItem): string {
  const hasArticleSlot = slots.some(
    (s) =>
      isHole(s) &&
      (s.kind === 'article_um_uma' ||
        s.kind === 'article_o_a' ||
        s.kind === 'article_os_as'),
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
    } else if (kind === 'word_plural') {
      const pl = wordPluralTl(word);
      if (!pl) continue;
      if (!hasArticleSlot) {
        parts.push(articleFor('article_os_as', word.gender));
      }
      parts.push(pl);
    } else if (
      kind === 'article_um_uma' ||
      kind === 'article_o_a' ||
      kind === 'article_os_as'
    ) {
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
    if (kind === 'word' || kind === 'word_plural') {
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

function coreKindMap(coreItems?: CoreItem[]): Map<string, PatternKind> {
  const map = new Map<string, PatternKind>();
  for (const c of coreItems ?? []) {
    if (c.kind !== 'pattern') continue;
    const k = resolvePatternKind(c.id, c.pattern_kind);
    if (k) map.set(c.id, k);
  }
  return map;
}

/**
 * Code-owned pattern completion:
 * - applies template slots when kind is set/inferred
 * - fills word holes from core.fills when present, else today's word items
 * - plural_def only uses words that have plural_tl
 * - builds 3–4 derived phrase examples pattern.<x>.ex.<n> with derived=true
 */
export function fillPatternsInBank(
  bank: Item[],
  opts?: { coreItems?: CoreItem[] },
): Item[] {
  const words = bank.filter((i): i is WordItem => i.type === 'word');
  const wordById = new Map(words.map((w) => [w.id, w]));
  const coreFills = new Map<string, string[]>();
  const kinds = coreKindMap(opts?.coreItems);
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
    const kind =
      resolvePatternKind(pattern.id, pattern.kind ?? kinds.get(pattern.id)) ??
      null;

    let slots: PatternSlot[] =
      kind != null
        ? slotsForKind(kind)
        : ((pattern.slots ?? []) as PatternSlot[]);

    if (!slots.length) return item;

    const needsPlural = kind === 'plural_def';
    const candidateIds =
      coreFills.get(pattern.id)?.filter((id) => wordById.has(id)) ??
      words.map((w) => w.id);
    const fillIds = needsPlural
      ? candidateIds.filter((id) => {
          const w = wordById.get(id);
          return w != null && wordPluralTl(w) != null;
        })
      : candidateIds;
    if (!fillIds.length) {
      return kind != null
        ? ({ ...pattern, kind, slots } as Item)
        : ({ ...pattern, slots } as Item);
    }

    slots = slots.map((slot) => {
      if (!isHole(slot)) return slot;
      const sk = slot.kind ?? 'word';
      if (sk === 'word' || sk === 'word_plural') {
        return {
          ...slot,
          kind: sk,
          fills: fillIds.slice(0, Math.max(4, fillIds.length)),
        };
      }
      return { ...slot, kind: sk, fills: undefined };
    }) as PatternSlot[];

    // Legacy free-form slots: auto-insert um/uma before word hole if no article.
    if (!kind) {
      const hasArticle = slots.some(
        (s) =>
          isHole(s) &&
          (s.kind === 'article_um_uma' ||
            s.kind === 'article_o_a' ||
            s.kind === 'article_os_as'),
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
      if (!tl.trim()) continue;
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

    if (!exampleIds.length) {
      return kind != null
        ? ({ ...pattern, kind, slots } as Item)
        : ({ ...pattern, slots } as Item);
    }

    return {
      ...pattern,
      ...(kind != null ? { kind } : {}),
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
    kind: 'polite_request',
    slots: slotsForKind('polite_request'),
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

/**
 * Build singular↔plural display items from words that have plural_tl.
 * Spec: pairs show the SAME item (o ovo / os ovos) — left = word id,
 * right = derived phrase.pl_<stem> with os/as + plural_tl.
 */
export function ensurePluralPairItems(bank: Item[]): {
  bank: Item[];
  pairs: { left: string; right: string }[];
} {
  const words = bank.filter((i): i is WordItem => i.type === 'word');
  const byId = new Map(bank.map((i) => [i.id, i]));
  const added: Item[] = [];
  const pairs: { left: string; right: string }[] = [];

  for (const word of words) {
    const plBare = wordPluralTl(word);
    if (!plBare) continue;
    const art = articleFor('article_os_as', word.gender);
    const pluralTl = `${art} ${plBare}`;
    const stem = word.id.replace(/^word\./, '') || word.id;
    const pluralId = `phrase.pl_${stem}`;
    if (!byId.has(pluralId) && !added.some((a) => a.id === pluralId)) {
      added.push({
        type: 'phrase',
        id: pluralId,
        tl: pluralTl,
        ar: word.ar,
        say: transliteratePtToSay(pluralTl),
        context_eg: 'صيغة الجمع',
        cloze: art,
        derived: true,
        has_card: false,
      } as Item);
    }
    pairs.push({ left: word.id, right: pluralId });
  }

  return { bank: [...bank, ...added], pairs };
}

/** Rewrite vs_pairs that look plural-related to same-item singular/plural. */
export function fixPluralVsPairs(
  page: {
    blocks: Array<
      | { type: string; pairs?: { left: string; right: string; note?: unknown }[] }
      | Record<string, unknown>
    >;
  },
  items: Item[],
): typeof page {
  const { pairs: canonical } = ensurePluralPairItems(items);
  if (!canonical.length) return page;
  const canByLeft = new Map(canonical.map((p) => [p.left, p]));
  const plIds = new Set(canonical.map((p) => p.right));

  return {
    ...page,
    blocks: page.blocks.map((block) => {
      if (block.type !== 'vs_pairs' || !Array.isArray(block.pairs)) return block;
      const nextPairs = block.pairs.map((pair, i) => {
        const left = String(pair.left ?? '');
        const right = String(pair.right ?? '');
        // Already a canonical same-item pair
        const hit = canByLeft.get(left);
        if (hit && (right === hit.right || plIds.has(right))) {
          return { ...pair, left: hit.left, right: hit.right };
        }
        // Replace with next canonical pair when either side is a plural-ish word
        const leftWord = items.find((it) => it.id === left && it.type === 'word');
        const rightWord = items.find((it) => it.id === right && it.type === 'word');
        const eitherHasPl =
          (leftWord && wordPluralTl(leftWord as WordItem)) ||
          (rightWord && wordPluralTl(rightWord as WordItem));
        if (eitherHasPl && leftWord) {
          const c = canByLeft.get(leftWord.id);
          if (c) return { ...pair, left: c.left, right: c.right };
        }
        // Pad thin plural compare pages from canonical list
        const fallback = canonical[i % canonical.length];
        if (
          fallback &&
          (left.startsWith('word.') || right.startsWith('word.')) &&
          left !== fallback.left
        ) {
          // Only rewrite when both sides are word ids that aren't a matched pair
          if (leftWord && rightWord && leftWord.id !== rightWord.id) {
            const c = canByLeft.get(leftWord.id) ?? fallback;
            return { ...pair, left: c.left, right: c.right };
          }
        }
        return pair;
      });
      return { ...block, pairs: nextPairs };
    }),
  };
}
