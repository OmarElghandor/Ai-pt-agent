import type { Item } from '@/lib/v2/content/items';
import {
  coreItemsThroughDay,
  findCoreItemById,
  type CoreItem,
} from './coreItems';
import { resolvePatternKind } from './patternTemplates';

/** Infer m/f from a leading Portuguese article on core tl. */
function genderFromArticleTl(tl: string): 'm' | 'f' | 'n' {
  if (/^(a|as|uma|umas)\s+/i.test(tl.trim())) return 'f';
  if (/^(o|os|um|uns)\s+/i.test(tl.trim())) return 'm';
  return 'n';
}

function wordStubFromCore(core: CoreItem): Item | null {
  if (core.kind !== 'word') return null;
  const row: Extract<Item, { type: 'word' }> = {
    type: 'word',
    id: core.id,
    tl: core.tl,
    gender: genderFromArticleTl(core.tl),
    ar: '…',
  };
  if (typeof core.plural_tl === 'string' && core.plural_tl.trim()) {
    return { ...row, plural_tl: core.plural_tl };
  }
  return row;
}

/**
 * Apply plural_tl from today's core rows, then fill gaps from the curriculum
 * file so prior-day fill words still get plurals for plural_def examples.
 */
export function applyCorePluralTl(
  items: Item[],
  coreItems: CoreItem[],
): Item[] {
  const pluralById = new Map<string, string | null>();
  for (const c of coreItems) {
    if (c.kind === 'word' && 'plural_tl' in c) {
      pluralById.set(c.id, c.plural_tl ?? null);
    }
  }
  return items.map((it) => {
    if (it.type !== 'word') return it;
    if (pluralById.has(it.id)) {
      const plural_tl = pluralById.get(it.id);
      if (plural_tl === null) {
        const { plural_tl: _drop, plural: _drop2, ...rest } = it as Item & {
          plural_tl?: string;
          plural?: string;
        };
        return rest as Item;
      }
      return { ...it, plural_tl: plural_tl as string } as Item;
    }
    const existing =
      ('plural_tl' in it &&
        typeof it.plural_tl === 'string' &&
        it.plural_tl.trim()) ||
      ('plural' in it &&
        typeof (it as { plural?: string }).plural === 'string' &&
        (it as { plural: string }).plural.trim());
    if (existing) return it;
    const core = findCoreItemById(it.id);
    if (
      core?.kind === 'word' &&
      typeof core.plural_tl === 'string' &&
      core.plural_tl.trim()
    ) {
      return { ...it, plural_tl: core.plural_tl } as Item;
    }
    return it;
  });
}

/** Ensure a word item carries curriculum plural_tl when the row lacks one. */
function withCurriculumPluralTl(word: Item): Item {
  if (word.type !== 'word') return word;
  const existing =
    ('plural_tl' in word &&
      typeof word.plural_tl === 'string' &&
      word.plural_tl.trim()) ||
    ('plural' in word &&
      typeof (word as { plural?: string }).plural === 'string' &&
      (word as { plural: string }).plural.trim());
  if (existing) return word;
  const core = findCoreItemById(word.id);
  if (
    core?.kind === 'word' &&
    typeof core.plural_tl === 'string' &&
    core.plural_tl.trim()
  ) {
    return { ...word, plural_tl: core.plural_tl } as Item;
  }
  return word;
}

function addWordFill(
  byId: Map<string, Item>,
  fillId: string,
  knownFull: Map<string, Item>,
): void {
  if (byId.has(fillId)) {
    const existing = byId.get(fillId)!;
    if (existing.type === 'word') {
      byId.set(fillId, withCurriculumPluralTl(existing));
    }
    return;
  }
  const known = knownFull.get(fillId);
  if (known?.type === 'word') {
    byId.set(
      fillId,
      withCurriculumPluralTl({
        ...(known as Item),
        extra: undefined,
      } as Item),
    );
    return;
  }
  const core = findCoreItemById(fillId);
  if (core?.kind !== 'word') return;
  const stub = wordStubFromCore(core);
  if (stub) byId.set(fillId, stub);
}

/**
 * Pattern core.fills may list prior-day nouns that are neither core nor recycle.
 * Inject them so fillPatternsInBank can build derived examples.
 */
export function injectPatternFillWords(
  items: Item[],
  coreItems: CoreItem[],
  knownFull: Map<string, Item>,
): Item[] {
  const byId = new Map(items.map((i) => [i.id, i] as const));
  for (const c of coreItems) {
    if (c.kind !== 'pattern' || !c.fills?.length) continue;
    for (const fillId of c.fills) {
      addWordFill(byId, fillId, knownFull);
    }
  }
  return [...byId.values()];
}

/**
 * Copy known pattern.*.ex phrases into the bank so recycle/story days keep
 * prior derived examples before fillPatternsInBank runs.
 */
export function attachKnownPatternExamples(
  items: Item[],
  knownFull: Map<string, Item>,
): Item[] {
  const byId = new Map(items.map((i) => [i.id, i] as const));
  for (const item of items) {
    if (item.type !== 'pattern') continue;
    const listed = Array.isArray((item as { examples?: string[] }).examples)
      ? ((item as { examples?: string[] }).examples ?? []).filter(
          (id): id is string => typeof id === 'string',
        )
      : [];
    for (const exId of listed) {
      if (byId.has(exId)) continue;
      const known = knownFull.get(exId);
      if (known?.type === 'phrase') {
        byId.set(exId, { ...known, extra: undefined } as Item);
      }
    }
    for (const [kid, known] of knownFull) {
      if (byId.has(kid)) continue;
      if (
        known.type === 'phrase' &&
        kid.startsWith(`${item.id}.ex.`) &&
        /^pattern\..+\.ex\.\d+$/.test(kid)
      ) {
        byId.set(kid, { ...known, extra: undefined } as Item);
      }
    }
  }
  return [...byId.values()];
}

const NOUN_TEMPLATE_KINDS = new Set([
  'article_def',
  'article_indef',
  'plural_def',
]);

/**
 * Story/recycle banks often have template patterns but no nouns. Seed up to 4
 * fill words so fillPatternsInBank can build article/plural examples.
 */
export function seedRecyclePatternFillWords(
  items: Item[],
  knownFull: Map<string, Item>,
  day: number,
): Item[] {
  const byId = new Map(items.map((i) => [i.id, i] as const));
  const bankWords = () =>
    [...byId.values()].filter((i): i is Extract<Item, { type: 'word' }> => {
      if (i.type !== 'word') return false;
      const tl = typeof i.tl === 'string' ? i.tl.trim() : '';
      return Boolean(tl);
    });

  for (const item of [...byId.values()]) {
    if (item.type !== 'pattern') continue;
    const kind = resolvePatternKind(
      item.id,
      'kind' in item ? (item.kind as string | undefined) : undefined,
    );
    if (!kind || !NOUN_TEMPLATE_KINDS.has(kind)) continue;

    const needsPlural = kind === 'plural_def';
    const usable = bankWords().filter((w) => {
      if (!needsPlural) return true;
      const pl =
        ('plural_tl' in w &&
          typeof w.plural_tl === 'string' &&
          w.plural_tl.trim()) ||
        ('plural' in w &&
          typeof (w as { plural?: string }).plural === 'string' &&
          (w as { plural: string }).plural.trim());
      return Boolean(pl);
    });
    if (usable.length >= 3) continue;

    const want = 4;
    const candidates: string[] = [];
    const core = findCoreItemById(item.id);
    if (core?.kind === 'pattern' && core.fills?.length) {
      candidates.push(...core.fills);
    }
    for (const [id, known] of knownFull) {
      if (
        known.type === 'word' &&
        typeof known.tl === 'string' &&
        known.tl.trim()
      ) {
        candidates.push(id);
      }
    }
    for (const c of coreItemsThroughDay(day)) {
      if (c.kind === 'word') candidates.push(c.id);
    }

    const seen = new Set(usable.map((w) => w.id));
    for (const fillId of candidates) {
      if (seen.has(fillId)) continue;
      addWordFill(byId, fillId, knownFull);
      const added = byId.get(fillId);
      if (added?.type !== 'word') continue;
      if (needsPlural) {
        const withPl = withCurriculumPluralTl(added);
        byId.set(fillId, withPl);
        const pl =
          ('plural_tl' in withPl &&
            typeof withPl.plural_tl === 'string' &&
            withPl.plural_tl.trim()) ||
          ('plural' in withPl &&
            typeof (withPl as { plural?: string }).plural === 'string' &&
            (withPl as { plural: string }).plural.trim());
        if (!pl) continue;
      }
      seen.add(fillId);
      if (seen.size >= want) break;
    }
  }
  return [...byId.values()];
}
