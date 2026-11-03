import type { Item } from '@/lib/v2/content/items';
import type { Rt } from '@/lib/v2/content/rt';

const MIN_ELIGIBLE = 4;
const MAX_ROUNDS = 6;
const DISTRACTORS = 3;

export type FindImageCard = {
  itemId: string;
  /** Ready Cloudinary/http url, or null → ImageSlot placeholder. */
  url: string | null;
  tl: string;
  ar: string;
};

export type FindImageRound = {
  targetId: string;
  tl: string;
  say?: string;
  ar: string;
  gender?: 'm' | 'f' | 'n';
  /** اسم مذكر | اسم مؤنث | جملة */
  tag: string;
  /** Optional gender/article tip as rich text (eg + tl segments). */
  note: Rt | null;
  cards: FindImageCard[];
  correctIndex: number;
};

/** Raw image.url on the lesson item — never media.image keys. */
export function itemReadyImageUrl(item: Item | undefined | null): string | null {
  if (!item || !('image' in item) || !item.image) return null;
  const url = item.image.url;
  return typeof url === 'string' && url.trim() ? url.trim() : null;
}

function isWordOrPhrase(
  item: Item,
): item is Item & { type: 'word' | 'phrase'; tl: string; ar: string } {
  return item.type === 'word' || item.type === 'phrase';
}

/** Same card rule as buildImageManifest — has_card !== false. */
function isImageIntended(item: Item): boolean {
  return isWordOrPhrase(item) && item.has_card !== false;
}

function itemTl(item: Item): string {
  return 'tl' in item && typeof item.tl === 'string' ? item.tl : '';
}

function itemAr(item: Item): string {
  return 'ar' in item && typeof item.ar === 'string' ? item.ar : '';
}

function itemSay(item: Item): string | undefined {
  return 'say' in item && typeof item.say === 'string' && item.say
    ? item.say
    : undefined;
}

function itemGender(item: Item): 'm' | 'f' | 'n' | undefined {
  if (item.type !== 'word') return undefined;
  const g = item.gender;
  return g === 'm' || g === 'f' || g === 'n' ? g : undefined;
}

function splitArticle(tl: string): { article: string; rest: string } | null {
  const m = tl.match(/^(o|a|os|as|um|uma)\s+(.+)$/i);
  if (!m) return null;
  return { article: m[1]!, rest: m[2]! };
}

function genderFromArticle(article: string): 'm' | 'f' | 'n' {
  if (/^a|^uma/i.test(article)) return 'f';
  if (/^o|^um/i.test(article)) return 'm';
  return 'n';
}

/**
 * Words/phrases that get lesson images (carded), with or without a ready url.
 * Missing url → placeholder in the player.
 */
export function eligibleFindImageItems(items: readonly Item[]): Item[] {
  return items.filter(isImageIntended);
}

/**
 * Prefer words when ≥4 are carded (vocab days); else phrases (Day 1 greetings).
 */
export function findImageTargetPool(items: readonly Item[]): Item[] {
  const eligible = eligibleFindImageItems(items);
  const words = eligible.filter((i) => i.type === 'word');
  if (words.length >= MIN_ELIGIBLE) return words;
  const phrases = eligible.filter((i) => i.type === 'phrase');
  if (phrases.length >= MIN_ELIGIBLE) return phrases;
  return eligible;
}

/**
 * Ids that may be answers in the find-image step (preferred pool when visible).
 * Planner excludes listen_pick_image for these — pool may be >6; runtime picks ≤6.
 */
export function findImageTargetIds(items: readonly Item[]): string[] {
  const pool = findImageTargetPool(items);
  if (pool.length < MIN_ELIGIBLE) return [];
  return pool.map((i) => i.id);
}

function shuffleInPlace<T>(arr: T[], rand: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

function buildNote(
  target: Item,
  peers: readonly Item[],
): Rt | null {
  if (target.type !== 'word') return null;
  const gender = itemGender(target) ?? (() => {
    const parts = splitArticle(itemTl(target));
    return parts ? genderFromArticle(parts.article) : undefined;
  })();
  if (gender !== 'm' && gender !== 'f') return null;

  const parts = splitArticle(itemTl(target));
  const article = parts?.article?.toLowerCase() ?? (gender === 'f' ? 'a' : 'o');
  const label = gender === 'f' ? 'مؤنث' : 'مذكر';
  const group = gender === 'f' ? ('f' as const) : ('m' as const);

  const sameGender = peers
    .filter((p) => {
      if (p.id === target.id || p.type !== 'word') return false;
      const g =
        itemGender(p) ??
        (() => {
          const sp = splitArticle(itemTl(p));
          return sp ? genderFromArticle(sp.article) : undefined;
        })();
      return g === gender;
    })
    .slice(0, 1);

  const examples = [itemTl(target), ...sameGender.map(itemTl)].filter(Boolean);
  const note: Rt = [
    { text: article, lang: 'tl', group, bold: true },
    { text: ` + ${label} · زي `, lang: 'eg' },
    { text: examples[0]!, lang: 'tl', bold: true },
  ];
  if (examples[1]) {
    note.push({ text: ' و ', lang: 'eg' });
    note.push({ text: examples[1], lang: 'tl', bold: true });
  }
  return note;
}

function tagFor(item: Item): string {
  if (item.type === 'phrase') return 'جملة';
  const gender =
    itemGender(item) ??
    (() => {
      const parts = splitArticle(itemTl(item));
      return parts ? genderFromArticle(parts.article) : undefined;
    })();
  if (gender === 'f') return 'اسم مؤنث';
  if (gender === 'm') return 'اسم مذكر';
  return 'اسم';
}

/**
 * Build ≤6 rounds. Returns null when fewer than 4 carded words/phrases.
 * Cards may have null url (placeholder until v2_images is ready).
 * Pure — no DB, no image pipeline.
 */
export function buildFindImageRounds(
  items: readonly Item[],
  opts?: { random?: () => number },
): FindImageRound[] | null {
  const rand = opts?.random ?? Math.random;
  const eligible = eligibleFindImageItems(items);
  if (eligible.length < MIN_ELIGIBLE) return null;

  const targetPool = [...findImageTargetPool(items)];
  shuffleInPlace(targetPool, rand);
  const targets = targetPool.slice(0, Math.min(MAX_ROUNDS, targetPool.length));
  if (targets.length < 1) return null;

  const byId = new Map(eligible.map((i) => [i.id, i]));
  const rounds: FindImageRound[] = [];

  for (const target of targets) {
    const distractorPool = eligible.filter((i) => i.id !== target.id);
    shuffleInPlace(distractorPool, rand);
    const distractors = distractorPool.slice(0, DISTRACTORS);
    // Need 3 distractors; if short, still show what we have (≥4 eligible guarantees
    // at least 3 others when pool size ≥ 4).
    if (distractors.length < DISTRACTORS && eligible.length >= MIN_ELIGIBLE) {
      // Prefer any remaining eligible (already filtered); if still short, skip round.
      if (distractors.length < Math.min(DISTRACTORS, eligible.length - 1)) {
        continue;
      }
    }
    if (distractors.length < 1) continue;

    const cardItems = [target, ...distractors];
    shuffleInPlace(cardItems, rand);
    const cards: FindImageCard[] = cardItems.map((item) => ({
      itemId: item.id,
      url: itemReadyImageUrl(item),
      tl: itemTl(item),
      ar: itemAr(item),
    }));
    const correctIndex = cards.findIndex((c) => c.itemId === target.id);
    if (correctIndex < 0) continue;

    rounds.push({
      targetId: target.id,
      tl: itemTl(target),
      say: itemSay(target),
      ar: itemAr(target),
      gender: itemGender(target),
      tag: tagFor(target),
      note: buildNote(target, [...byId.values()]),
      cards,
      correctIndex,
    });
  }

  return rounds.length > 0 ? rounds : null;
}

export function findImageStepVisible(items: readonly Item[]): boolean {
  return eligibleFindImageItems(items).length >= MIN_ELIGIBLE;
}
