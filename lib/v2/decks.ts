import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { flashcardItems, isFlashcardItem } from '@/lib/v2/content/flashcards';
import { getPublishedLesson } from '@/lib/v2/content/getPublishedLesson';
import type { Item } from '@/lib/v2/content/items';
import {
  loadConjugationSeed,
  resolveForm,
  type SeedVerb,
} from '@/lib/v2/content/conjugations/resolve';
import { verbClass, type VerbClass } from '@/lib/v2/content/conjugations/regular';
import { V2ItemStateModel, V2LessonModel } from '@/lib/v2/mongo/models';
import type { ItemState } from '@/lib/v2/progress';
import { loadWeakItemIds } from '@/lib/v2/progress/weakItems';
import { itemTargetText } from '@/lib/v2/render/speechTarget';

export type PlanDay = {
  day: number;
  title_tl: string;
  title_ar: string;
  situation_eg: string;
  generation?: { situation_tl?: string };
};

export type DeckStatus = 'open' | 'locked' | 'future';

export type SituationDeckSummary = {
  id: string;
  kind: 'situation';
  day: number;
  title_tl: string;
  title_ar: string;
  situation_eg: string;
  situation_tl: string;
  total: number;
  today: number;
  graduated: number;
  /** Flashcard ids in this deck. The listing intersects these with today's queue. */
  item_ids: string[];
  status: DeckStatus;
};

export type VerbDeckSummary = {
  id: string;
  kind: 'verb';
  lemma: string;
  meaning_ar: string;
  verbClass: VerbClass | 'irregular';
  irregular: boolean;
  graduated: number;
  total: number;
};

export type DeckItemRow = {
  item_id: string;
  tl: string;
  gender?: 'm' | 'f' | 'n';
  type: Item['type'];
  status: 'new' | 'reviewing' | 'weak' | 'graduated';
};

export type DeckDetail = {
  id: string;
  kind: 'situation' | 'verb' | 'weak';
  day?: number;
  title_tl: string;
  title_ar: string;
  situation_eg?: string;
  total: number;
  today: number;
  graduated: number;
  items: DeckItemRow[];
};

export type DecksListing = {
  currentDay: number;
  understood: number;
  said: number;
  graduatedTotal: number;
  weakCount: number;
  situations: SituationDeckSummary[];
  verbs: VerbDeckSummary[];
};

type DayPlanFile = { days: PlanDay[] };

let cachedPlan: DayPlanFile | null = null;

export function loadDayPlan(
  path = join(process.cwd(), 'content/v2/plan/pt-PT.days.json'),
): DayPlanFile {
  if (cachedPlan) return cachedPlan;
  cachedPlan = JSON.parse(readFileSync(path, 'utf8')) as DayPlanFile;
  return cachedPlan;
}

function isWeakItem(
  itemId: string,
  state: ItemState | undefined,
  weakIds: Set<string>,
): boolean {
  return weakIds.has(itemId) || (state?.weakToolIds?.length ?? 0) > 0;
}

function stateStatus(
  itemId: string,
  state: ItemState | undefined,
  weakIds: Set<string>,
): DeckItemRow['status'] {
  if (state?.card.masteryLevel === 'mastered') return 'graduated';
  if (isWeakItem(itemId, state, weakIds)) return 'weak';
  if (!state) return 'new';
  if (state.card.interval > 0 || state.card.dueAt) return 'reviewing';
  return 'new';
}

function docToLightState(doc: Record<string, unknown>): ItemState {
  const card = (doc.card ?? {}) as Record<string, unknown>;
  const levels = (doc.levels ?? {}) as Record<string, number>;
  return {
    user_id: String(doc.user_id ?? ''),
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
    skills: {},
    card: {
      interval: Number(card.interval ?? 0),
      dueAt: card.dueAt
        ? new Date(card.dueAt as string | Date).toISOString()
        : null,
      masteryLevel:
        card.masteryLevel === 'mastered' ? 'mastered' : 'learning',
      consecutiveCorrect: Number(card.consecutiveCorrect ?? 0),
      face: String(card.face ?? 'recognize'),
      knowCheckDueAt: null,
    },
    lastImplicitReviewLocalDate: null,
    weakToolIds: Array.isArray(doc.weakToolIds)
      ? (doc.weakToolIds as string[])
      : [],
  };
}

/** Load flashcard items from all published lessons with day ≤ currentDay. */
export async function loadPublishedFlashcardsThrough(
  currentDay: number,
  targetLang = 'pt-PT',
): Promise<{ byDay: Map<number, Item[]>; byId: Map<string, Item> }> {
  const byDay = new Map<number, Item[]>();
  const byId = new Map<string, Item>();
  if (!mongoConfigured()) return { byDay, byId };
  await connectMongo();
  const docs = await V2LessonModel()
    .find({
      target_lang: targetLang,
      status: 'published',
      day: { $lte: currentDay },
    })
    .sort({ day: 1, version: -1 })
    .lean();

  const seen = new Set<number>();
  for (const doc of docs) {
    if (seen.has(doc.day)) continue;
    seen.add(doc.day);
    const items = flashcardItems(
      ((doc.data as { items?: Item[] })?.items ?? []) as Item[],
    );
    byDay.set(doc.day, items);
    for (const item of items) byId.set(item.id, item);
  }
  return { byDay, byId };
}

export async function buildDecksListing(opts: {
  user_id: string;
  currentDay: number;
}): Promise<DecksListing> {
  const plan = loadDayPlan();
  const { byDay, byId } = await loadPublishedFlashcardsThrough(opts.currentDay);

  let states: ItemState[] = [];
  if (mongoConfigured()) {
    await connectMongo();
    const docs = await V2ItemStateModel()
      .find({ user_id: opts.user_id })
      .lean();
    states = docs.map((d) =>
      docToLightState(d as unknown as Record<string, unknown>),
    );
  }
  const stateById = new Map(states.map((s) => [s.item_id, s]));
  const weakIds = await loadWeakItemIds(opts.user_id);

  let understood = 0;
  let said = 0;
  let graduatedTotal = 0;
  let weakCount = 0;
  for (const item of byId.values()) {
    const s = stateById.get(item.id);
    if (!s) continue;
    understood += s.levels.understood > 0 ? 1 : 0;
    said += s.levels.said > 0 ? 1 : 0;
    if (s.card.masteryLevel === 'mastered') graduatedTotal += 1;
    if (isWeakItem(item.id, s, weakIds)) weakCount += 1;
  }

  const situations: SituationDeckSummary[] = plan.days.map((d) => {
    const items = byDay.get(d.day) ?? [];
    const graduated = items.filter(
      (i) => stateById.get(i.id)?.card.masteryLevel === 'mastered',
    ).length;
    const today = items.filter((i) => {
      const st = stateById.get(i.id);
      if (!st) return d.day === opts.currentDay;
      if (st.card.masteryLevel === 'mastered') return false;
      return true;
    }).length;
    let status: DeckStatus = 'future';
    if (d.day > opts.currentDay) status = 'future';
    else if (!byDay.has(d.day)) status = 'locked';
    else status = 'open';

    return {
      id: `day:${d.day}`,
      kind: 'situation' as const,
      day: d.day,
      title_tl: d.title_tl,
      title_ar: d.title_ar,
      situation_eg: d.situation_eg,
      situation_tl: d.generation?.situation_tl ?? d.title_tl,
      total: items.length,
      today: status === 'open' ? Math.min(today, items.length) : 0,
      graduated,
      item_ids: status === 'open' ? items.map((i) => i.id) : [],
      status,
    };
  });

  // Reached days newest first; future days soonest first.
  situations.sort((a, b) => {
    const af = a.status === 'future' ? 1 : 0;
    const bf = b.status === 'future' ? 1 : 0;
    if (af !== bf) return af - bf;
    return af === 1 ? a.day - b.day : b.day - a.day;
  });

  const seed = loadConjugationSeed();
  const verbs: VerbDeckSummary[] = seed.verbs
    .filter((v) => v.verified && stateById.has(`verb.${v.lemma}`))
    .map((v) => verbSummary(v, byId, stateById));

  return {
    currentDay: opts.currentDay,
    understood,
    said,
    graduatedTotal,
    weakCount,
    situations,
    verbs,
  };
}

function verbSummary(
  v: SeedVerb,
  byId: Map<string, Item>,
  stateById: Map<string, ItemState>,
): VerbDeckSummary {
  const itemId = `verb.${v.lemma}`;
  const item = byId.get(itemId);
  const endingClass = verbClass(v.lemma);
  const irregular =
    v.class === 'irregular' ||
    resolveForm(`verb.${v.lemma}:pres:eu`)?.irregular === true;
  const state = stateById.get(itemId);
  return {
    id: `verb:${v.lemma}`,
    kind: 'verb',
    lemma: v.lemma,
    meaning_ar: item && 'ar' in item ? item.ar : v.meaning_ar,
    verbClass: endingClass ?? 'irregular',
    irregular,
    graduated: state?.card.masteryLevel === 'mastered' ? 1 : 0,
    total: 1,
  };
}

export async function getDeckDetail(opts: {
  user_id: string;
  deckId: string;
  currentDay: number;
}): Promise<DeckDetail | null> {
  const { byDay, byId } = await loadPublishedFlashcardsThrough(opts.currentDay);
  let states: ItemState[] = [];
  if (mongoConfigured()) {
    await connectMongo();
    const docs = await V2ItemStateModel()
      .find({ user_id: opts.user_id })
      .lean();
    states = docs.map((d) =>
      docToLightState(d as unknown as Record<string, unknown>),
    );
  }
  const stateById = new Map(states.map((s) => [s.item_id, s]));
  const weakIds = await loadWeakItemIds(opts.user_id);

  if (opts.deckId === 'weak') {
    const weakItems = [...byId.values()].filter((i) =>
      isWeakItem(i.id, stateById.get(i.id), weakIds),
    );
    return {
      id: 'weak',
      kind: 'weak',
      title_tl: 'اللي بتغلط فيه',
      title_ar: 'اللي بتغلط فيه',
      total: weakItems.length,
      today: weakItems.length,
      graduated: 0,
      items: weakItems.map((i) => rowFromItem(i, stateById.get(i.id), weakIds)),
    };
  }

  if (opts.deckId.startsWith('day:')) {
    const day = Number(opts.deckId.slice(4));
    if (!Number.isFinite(day)) return null;
    const plan = loadDayPlan().days.find((d) => d.day === day);
    const items = byDay.get(day) ?? [];
    // Title extras from the pack are optional — some published drafts fail pack parse.
    let publishedSituation: { tl?: string; eg?: string } | undefined;
    try {
      const published = await getPublishedLesson(day);
      publishedSituation = published?.pack.lesson.situation;
    } catch {
      publishedSituation = undefined;
    }
    const graduated = items.filter(
      (i) => stateById.get(i.id)?.card.masteryLevel === 'mastered',
    ).length;
    return {
      id: opts.deckId,
      kind: 'situation',
      day,
      title_tl:
        plan?.title_tl ??
        publishedSituation?.tl ??
        `Dia ${day}`,
      title_ar: plan?.title_ar ?? '',
      situation_eg: plan?.situation_eg ?? publishedSituation?.eg,
      total: items.length,
      today: items.filter((i) => stateById.get(i.id)?.card.masteryLevel !== 'mastered')
        .length,
      graduated,
      items: items.map((i) => rowFromItem(i, stateById.get(i.id), weakIds)),
    };
  }

  if (opts.deckId.startsWith('verb:')) {
    const lemma = opts.deckId.slice(5);
    const itemId = `verb.${lemma}`;
    const item = byId.get(itemId);
    const seed = loadConjugationSeed().verbs.find((v) => v.lemma === lemma);
    if (!item && !seed) return null;
    const tl = (item ? itemTargetText(item) : null) ?? lemma;
    const ar = item && 'ar' in item ? item.ar : (seed?.meaning_ar ?? '');
    const fakeItem: Item =
      item ??
      ({
        type: 'word',
        id: itemId,
        tl,
        ar,
        lemma,
      } as Item);
    const state = stateById.get(itemId);
    return {
      id: opts.deckId,
      kind: 'verb',
      title_tl: tl.toUpperCase(),
      // Listing shows the meaning. Detail rows and this title do not.
      title_ar: '',
      total: 1,
      today: state?.card.masteryLevel === 'mastered' ? 0 : 1,
      graduated: state?.card.masteryLevel === 'mastered' ? 1 : 0,
      items: [rowFromItem(fakeItem, state, weakIds)],
    };
  }

  return null;
}

function rowFromItem(
  item: Item,
  state: ItemState | undefined,
  weakIds: Set<string>,
): DeckItemRow {
  return {
    item_id: item.id,
    tl: itemTargetText(item) ?? item.id,
    gender: item.type === 'word' ? item.gender : undefined,
    type: item.type,
    status: stateStatus(item.id, state, weakIds),
  };
}

export type CardFacePayload = {
  item_id: string;
  kind: 'word' | 'phrase' | 'verb';
  tl: string;
  ar: string;
  say?: string;
  gender?: 'm' | 'f' | 'n';
  plural?: string;
  example?: string;
  hint_tl?: string;
  context_eg?: string;
  role?: 'said' | 'heard';
  variation_tl?: string;
  replies_to_tl?: string;
  lemma?: string;
  verbClass?: VerbClass | 'irregular';
  conjugation?: {
    person: string;
    label_tl: string;
    label_ar: string;
    tl: string;
    stem: string;
    ending: string;
    irregular: boolean;
  }[];
};

/** A hint is a Portuguese sentence, never the bare headword and never Arabic. */
function hintSentence(example: string | undefined, head: string): string | undefined {
  const text = example?.trim();
  if (!text) return undefined;
  if (text.localeCompare(head, undefined, { sensitivity: 'accent' }) === 0) {
    return undefined;
  }
  return text;
}

/**
 * Resolve a display example / hint sentence from the item bank.
 * `example` may be a raw TL string or an item id; patterns use `examples[]` refs.
 */
function resolveExampleTl(
  item: Item,
  head: string,
  itemsById?: Map<string, Item>,
): string | undefined {
  const raw =
    'example' in item && typeof item.example === 'string'
      ? item.example.trim()
      : '';
  if (raw && itemsById?.has(raw)) {
    const resolved = itemTargetText(itemsById.get(raw)!) ?? undefined;
    return hintSentence(resolved, head);
  }
  if (raw) return hintSentence(raw, head);

  const refs =
    'examples' in item && Array.isArray(item.examples)
      ? (item.examples as string[])
      : [];
  const first = refs[0];
  if (first && itemsById?.has(first)) {
    const resolved = itemTargetText(itemsById.get(first)!) ?? undefined;
    return hintSentence(resolved, head);
  }
  return undefined;
}

function wordPlural(item: Extract<Item, { type: 'word' }>): string | undefined {
  const withTl = item as Extract<Item, { type: 'word' }> & {
    plural_tl?: string;
  };
  const value = withTl.plural_tl?.trim() || item.plural?.trim();
  return value || undefined;
}

function phraseReplyTl(
  item: Extract<Item, { type: 'phrase' }>,
  itemsById?: Map<string, Item>,
): string | undefined {
  if (!itemsById) return undefined;
  if (item.replies_to) {
    const other = itemsById.get(item.replies_to);
    if (other && 'tl' in other && typeof other.tl === 'string') return other.tl;
  }
  for (const other of itemsById.values()) {
    if (other.type !== 'phrase') continue;
    if (other.replies_to === item.id && other.tl) return other.tl;
  }
  return undefined;
}

const PERSON_ROWS: { person: 'eu' | 'tu' | 'ele' | 'nos' | 'eles'; label_tl: string; label_ar: string }[] =
  [
    { person: 'eu', label_tl: 'eu', label_ar: 'أنا' },
    { person: 'tu', label_tl: 'tu', label_ar: 'أنت' },
    { person: 'ele', label_tl: 'ele / ela / você', label_ar: 'هو / هي / حضرتك' },
    { person: 'nos', label_tl: 'nós', label_ar: 'نحن' },
    { person: 'eles', label_tl: 'eles / elas / vocês', label_ar: 'هم / هن / أنتم' },
  ];

export function cardFaceFromItem(
  item: Item,
  itemsById?: Map<string, Item>,
): CardFacePayload | null {
  if (!isFlashcardItem(item) && !item.id.startsWith('verb.')) {
    if (item.type !== 'word' && item.type !== 'phrase') return null;
  }

  if (item.id.startsWith('verb.') && !item.id.includes(':')) {
    const lemma =
      ('lemma' in item && item.lemma) || item.id.slice('verb.'.length);
    const cls = verbClass(lemma) ?? 'irregular';
    const conjugation = PERSON_ROWS.map((row) => {
      const form = resolveForm(`verb.${lemma}:pres:${row.person}`);
      return {
        person: row.person,
        label_tl: row.label_tl,
        label_ar: row.label_ar,
        tl: form?.tl ?? '—',
        stem: form?.stem ?? '',
        ending: form?.ending ?? form?.tl ?? '',
        irregular: form?.irregular ?? false,
      };
    });
    const exampleTl = resolveExampleTl(item, lemma, itemsById);
    return {
      item_id: item.id,
      kind: 'verb',
      tl: itemTargetText(item) ?? lemma,
      ar: 'ar' in item ? item.ar : '',
      say: 'say' in item ? item.say : undefined,
      example: exampleTl,
      hint_tl: exampleTl,
      lemma,
      verbClass: cls,
      conjugation,
    };
  }

  if (item.type === 'word') {
    const exampleTl = resolveExampleTl(item, item.tl, itemsById);
    return {
      item_id: item.id,
      kind: 'word',
      tl: item.tl,
      ar: item.ar,
      say: item.say,
      gender: item.gender,
      plural: wordPlural(item),
      example: exampleTl,
      hint_tl: exampleTl,
    };
  }

  if (item.type === 'phrase') {
    const reply = phraseReplyTl(item, itemsById);
    return {
      item_id: item.id,
      kind: 'phrase',
      tl: item.tl,
      ar: item.ar,
      say: item.say,
      context_eg: item.context_eg,
      role: item.role === 'heard' ? 'heard' : 'said',
      variation_tl: item.tl_f,
      replies_to_tl: reply,
    };
  }

  return null;
}

async function fillFacesFromAnyLesson(
  byId: Map<string, Item>,
  itemIds: string[],
) {
  const missing = itemIds.filter((id) => !byId.has(id));
  if (!missing.length || !mongoConfigured()) return;
  await connectMongo();
  const docs = await V2LessonModel()
    .find({ status: 'published', 'data.items.id': { $in: missing } })
    .sort({ version: -1 })
    .lean();
  for (const doc of docs) {
    const items = flashcardItems(
      ((doc.data as { items?: Item[] })?.items ?? []) as Item[],
    );
    for (const item of items) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
  }
}

export async function hydrateCardFaces(
  itemIds: string[],
  currentDay: number,
): Promise<Map<string, CardFacePayload>> {
  const { byId } = await loadPublishedFlashcardsThrough(currentDay);
  await fillFacesFromAnyLesson(byId, itemIds);
  // Also pull verb lemmas from seed even if not in a lesson pack yet
  const seed = loadConjugationSeed();
  for (const v of seed.verbs) {
    const id = `verb.${v.lemma}`;
    if (!byId.has(id)) {
      byId.set(id, {
        type: 'word',
        id,
        tl: v.lemma,
        lemma: v.lemma,
        ar: v.meaning_ar,
      } as Item);
    }
  }

  const out = new Map<string, CardFacePayload>();
  for (const id of itemIds) {
    const item = byId.get(id);
    if (!item) continue;
    const face = cardFaceFromItem(item, byId);
    if (face) out.set(id, face);
  }
  return out;
}
