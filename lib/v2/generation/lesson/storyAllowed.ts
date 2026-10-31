import type { Item, Person, Tense } from '@/lib/v2/content/items';
import {
  loadConjugationSeed,
  resolveForm,
} from '@/lib/v2/content/conjugations/resolve';
import type { CoreItem } from './coreItems';
import { coreItemsThroughDay } from './coreItems';
import { normToken, tokenizeRaw } from './storyTokens';

const TENSES: Tense[] = ['inf', 'pres', 'pret', 'imperf', 'fut', 'cond', 'imp'];
const PERSONS: Person[] = ['eu', 'tu', 'ele', 'nos', 'eles'];

function addTlTokens(out: Set<string>, tl: string | undefined | null): void {
  if (!tl?.trim()) return;
  for (const t of tokenizeRaw(tl)) {
    const n = normToken(t);
    if (n) out.add(n);
  }
}

/** Extract speakable TL strings from an item or core row. */
function tlsFromItem(item: Item | CoreItem): string[] {
  const out: string[] = [];
  if ('tl' in item && typeof item.tl === 'string' && item.tl.trim()) {
    out.push(item.tl);
  }
  const plural =
    'plural_tl' in item
      ? (item as { plural_tl?: string | null }).plural_tl
      : undefined;
  if (typeof plural === 'string' && plural.trim()) out.push(plural);
  const tlF =
    'tl_f' in item ? (item as { tl_f?: string }).tl_f : undefined;
  if (typeof tlF === 'string' && tlF.trim()) out.push(tlF);
  const variantTl =
    'variant_tl' in item
      ? (item as { variant_tl?: string[] }).variant_tl
      : 'variants' in item
        ? (item as { variants?: string[] }).variants
        : undefined;
  if (Array.isArray(variantTl)) {
    for (const v of variantTl) {
      if (typeof v === 'string' && v.trim()) out.push(v);
    }
  }
  return out;
}

function lemmaFromItem(item: Item | CoreItem): string | null {
  if (item.id.startsWith('verb.')) {
    // verb.falar or verb.falar:pres:eu
    const rest = item.id.slice('verb.'.length);
    return rest.split(':')[0] || null;
  }
  if ('lemma' in item && typeof (item as { lemma?: string }).lemma === 'string') {
    return (item as { lemma: string }).lemma;
  }
  if ('type' in item && (item as Item).type === 'form') {
    const form = item as Item & { lemma?: string };
    return form.lemma ?? null;
  }
  return null;
}

/**
 * Build the set of normalized content tokens allowed in today's story.
 * = today core + recycle + all prior days (lessons ∪ core file) + conjugations.
 * Never depends on yesterday digest.
 */
export function buildStoryAllowedVocab(opts: {
  day: number;
  coreItems: CoreItem[];
  recycleIds: string[];
  /** Today's generated bank + any known map values. */
  items: Item[];
  /** Prior+registry map (from loadKnownItemMap). */
  knownById?: Map<string, Item>;
  targetLang?: string;
}): Set<string> {
  const tokens = new Set<string>();
  const byId = new Map<string, Item | CoreItem>();

  for (const c of opts.coreItems) byId.set(c.id, c);
  for (const item of opts.items) byId.set(item.id, item);

  // Prior days from core file (fill gaps when lessons not generated)
  if (opts.day > 1) {
    for (const c of coreItemsThroughDay(opts.day - 1)) {
      if (!byId.has(c.id)) byId.set(c.id, c);
    }
  }

  // Known map (lessons day < today + registry) — never shrink if empty
  if (opts.knownById) {
    for (const [id, item] of opts.knownById) {
      byId.set(id, item);
    }
  }

  // Recycle ids must resolve
  for (const id of opts.recycleIds) {
    const hit = byId.get(id) ?? opts.knownById?.get(id);
    if (hit) byId.set(id, hit);
  }

  const lemmas = new Set<string>();

  for (const [id, item] of byId) {
    // Pattern example ids are not story-usable ids, but their surface forms
    // may still appear via the parent pattern template — skip adding as ids only.
    if (/^pattern\..+\.ex\.\d+$/.test(id)) continue;

    for (const tl of tlsFromItem(item)) addTlTokens(tokens, tl);

    const lemma = lemmaFromItem(item);
    if (lemma) lemmas.add(lemma);
  }

  // Core file always wins for plurals / templates — draft items often omit plural_tl
  // and pattern.tl, which would otherwise shrink the allowed set.
  const coreUnion = [
    ...coreItemsThroughDay(opts.day),
    ...opts.coreItems,
  ];
  for (const c of coreUnion) {
    if (/^pattern\..+\.ex\.\d+$/.test(c.id)) continue;
    for (const tl of tlsFromItem(c)) addTlTokens(tokens, tl);
    if (c.kind === 'verb' && c.tl) {
      const lemma = c.id.startsWith('verb.')
        ? c.id.slice('verb.'.length).split(':')[0]
        : null;
      if (lemma) lemmas.add(lemma);
    }
  }

  // Conjugations for allowed lemmas
  try {
    const seed = loadConjugationSeed();
    for (const lemma of lemmas) {
      if (!seed.verbs.some((v) => v.lemma === lemma)) continue;
      for (const tense of TENSES) {
        for (const person of PERSONS) {
          const form = resolveForm(`verb.${lemma}:${tense}:${person}`, seed);
          if (form?.tl) addTlTokens(tokens, form.tl);
        }
      }
    }
  } catch {
    // Seed missing in some test envs — ignore
  }

  return tokens;
}

/** Cast names / ids to exclude from content token counts. */
export function castNameTokens(
  cast: { id: string; name: string }[],
): Set<string> {
  const out = new Set<string>();
  for (const c of cast) {
    for (const t of tokenizeRaw(c.name)) {
      const n = normToken(t);
      if (n) out.add(n);
    }
    const id = normToken(c.id);
    if (id && id !== 'learner' && id !== 'narrator') out.add(id);
  }
  return out;
}

/**
 * ITEM_DIGEST lines for the story prompt: skip pattern.*.ex.N;
 * patterns must show template tl (fall back to core file when draft omits tl).
 */
export function buildStoryItemDigestLines(
  items: Item[],
  coreItems: CoreItem[] = [],
): string[] {
  const coreById = new Map(coreItems.map((c) => [c.id, c]));
  const lines: string[] = [];
  for (const item of items) {
    if (/^pattern\..+\.ex\.\d+$/.test(item.id)) continue;
    if (item.type === 'pattern') {
      const rawTl =
        'tl' in item && typeof (item as { tl?: string }).tl === 'string'
          ? (item as { tl: string }).tl
          : '';
      const coreTl = coreById.get(item.id)?.tl ?? '';
      const kind =
        'kind' in item && typeof (item as { kind?: string }).kind === 'string'
          ? (item as { kind: string }).kind
          : coreById.get(item.id)?.pattern_kind ?? '';
      const template = rawTl.trim() || coreTl.trim() || '(template missing)';
      lines.push(
        `${item.id} (pattern${kind ? `:${kind}` : ''}): ${template}`,
      );
      continue;
    }
    const tl =
      'tl' in item && typeof item.tl === 'string' ? item.tl : '';
    lines.push(`${item.id} (${item.type}): ${tl}`);
  }
  return lines;
}

/** Compact ALLOWED_PRIOR lines (id + tl) for prior/recycle, capped. */
export function buildAllowedPriorDigest(
  knownById: Map<string, Item>,
  opts: { day: number; recycleIds: string[]; todayIds: Set<string>; cap?: number },
): string[] {
  const cap = opts.cap ?? 80;
  const lines: string[] = [];
  const seen = new Set<string>();

  const add = (id: string, tl: string) => {
    if (opts.todayIds.has(id)) return;
    if (seen.has(id)) return;
    if (/^pattern\..+\.ex\.\d+$/.test(id)) return;
    seen.add(id);
    lines.push(`${id}: ${tl}`);
  };

  for (const id of opts.recycleIds) {
    const item = knownById.get(id);
    const tl =
      item && 'tl' in item && typeof item.tl === 'string' ? item.tl : '';
    if (tl) add(id, tl);
  }

  for (const c of coreItemsThroughDay(Math.max(0, opts.day - 1))) {
    if (c.tl) add(c.id, c.tl);
  }

  for (const [id, item] of knownById) {
    if (lines.length >= cap) break;
    const tl = 'tl' in item && typeof item.tl === 'string' ? item.tl : '';
    if (tl) add(id, tl);
  }

  return lines.slice(0, cap);
}
