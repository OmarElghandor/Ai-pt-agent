import type { Item } from '@/lib/v2/content/items';
import { itemReadyImageUrl } from '@/lib/v2/findImage/buildRounds';
import { orderVocabFlowIds } from './orderItems';

export type MicroCheckType =
  | 'pick_image'
  | 'pick_meaning'
  | 'pick_tl'
  | 'choose_article'
  | 'complete_phrase'
  | 'say_it';

export type VocabFlowStoryLine = {
  index: number;
  speaker: string;
  tl: string;
  ids?: string[];
  ar?: string;
};

export type VocabFlowCast = {
  id: string;
  name: string;
  role?: string;
};

export type VocabFlowOption = {
  id: string;
  label: string;
  /** Image url for pick_image; null → placeholder. */
  url?: string | null;
};

export type VocabFlowSlide =
  | {
      kind: 'item';
      itemId: string;
    }
  | {
      kind: 'phrase_in_use';
      itemId: string;
      lineIndex: number;
      speakerId: string;
      speakerName: string;
      tl: string;
      ar?: string;
    }
  | {
      kind: 'micro_check';
      checkType: MicroCheckType;
      /** Item the check is about (last item in the chunk, usually). */
      itemId: string;
      promptEg: string;
      /** Shown cue (TL, Arabic, or cloze stem). */
      cue?: string;
      options: VocabFlowOption[];
      correctIndex: number;
      whyEg: string;
      /** For say_it: the TL to speak. */
      sayTl?: string;
      /** Skill posted with the answer. */
      skill: 'listening' | 'reading';
      /** When true, UI self-rates only — do not POST SRS. */
      skipSrs?: boolean;
    }
  | {
      kind: 'breather';
      seen: number;
      total: number;
      chipIds: string[];
    }
  | {
      kind: 'tip';
      tipIndex: number;
    };

const CHECK_ROTATION: MicroCheckType[] = [
  'pick_meaning',
  'pick_tl',
  'choose_article',
  'complete_phrase',
  'pick_image',
  'say_it',
];

function itemTl(item: Item | undefined): string {
  return item && 'tl' in item && typeof item.tl === 'string' ? item.tl : '';
}

function itemAr(item: Item | undefined): string {
  return item && 'ar' in item && typeof item.ar === 'string' ? item.ar : '';
}

function isNounWord(item: Item | undefined): boolean {
  if (!item || item.type !== 'word') return false;
  if (item.gender === 'm' || item.gender === 'f') return true;
  return /^(o|a|os|as)\s+/i.test(item.tl);
}

function articleForWord(item: Item): string | null {
  if (item.type !== 'word') return null;
  const m = item.tl.match(/^(o|a|os|as)\s+/i);
  if (m) return m[1]!.toLowerCase();
  if (item.gender === 'f') return 'a';
  if (item.gender === 'm') return 'o';
  return null;
}

function stripArticle(tl: string): string {
  return tl.replace(/^(o|a|os|as|um|uma)\s+/i, '').trim();
}

function shuffleInPlace<T>(arr: T[], rand: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

function pickDistractorIds(
  answerId: string,
  pool: string[],
  n: number,
  rand: () => number,
): string[] {
  const others = pool.filter((id) => id !== answerId);
  shuffleInPlace(others, rand);
  return others.slice(0, n);
}

function firstStoryLineForItem(
  itemId: string,
  lines: VocabFlowStoryLine[],
): VocabFlowStoryLine | null {
  for (const line of lines) {
    if ((line.ids ?? []).includes(itemId)) return line;
  }
  return null;
}

function castName(
  speakerId: string,
  cast: VocabFlowCast[],
): string {
  if (speakerId === 'learner' || speakerId === 'yassin') return 'إنت';
  if (speakerId === 'narrator') return 'الراوي';
  const hit = cast.find((c) => c.id === speakerId);
  return hit?.name ?? speakerId;
}

function buildCompletePhrase(
  phrase: Item,
  seenIds: string[],
  byId: Map<string, Item>,
  rand: () => number,
): {
  cue: string;
  options: VocabFlowOption[];
  correctIndex: number;
  whyEg: string;
} | null {
  if (phrase.type !== 'phrase') return null;
  const cloze =
    'cloze' in phrase && typeof phrase.cloze === 'string' && phrase.cloze
      ? phrase.cloze
      : null;
  if (!cloze) return null;
  const tl = phrase.tl;
  const re = new RegExp(cloze.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (!re.test(tl)) return null;
  const cue = tl.replace(re, '____');
  const distractorWords = seenIds
    .map((id) => byId.get(id))
    .filter((i): i is Item => i != null && i.type === 'word' && itemTl(i) !== cloze)
    .map((i) => stripArticle(itemTl(i)) || itemTl(i));
  const uniq = [...new Set(distractorWords.filter(Boolean))];
  shuffleInPlace(uniq, rand);
  const labels = [cloze, ...uniq.slice(0, 2)];
  while (labels.length < 3) labels.push(cloze === 'um' ? 'uma' : 'um');
  const options = labels.map((label, i) => ({ id: `opt_${i}`, label }));
  shuffleInPlace(options, rand);
  const correctIndex = options.findIndex((o) => o.label === cloze);
  return {
    cue,
    options,
    correctIndex: correctIndex < 0 ? 0 : correctIndex,
    whyEg: `الجملة: ${tl}`,
  };
}

function tryBuildCheck(opts: {
  type: MicroCheckType;
  targetId: string;
  chunkIds: string[];
  seenIds: string[];
  earlierIds: string[];
  byId: Map<string, Item>;
  rand: () => number;
}): Extract<VocabFlowSlide, { kind: 'micro_check' }> | null {
  const target = opts.byId.get(opts.targetId);
  if (!target) return null;
  const pool = [
    ...new Set([...opts.seenIds, ...opts.earlierIds]),
  ].filter((id) => opts.byId.has(id));

  if (opts.type === 'say_it') {
    const tl = itemTl(target);
    if (!tl) return null;
    return {
      kind: 'micro_check',
      checkType: 'say_it',
      itemId: opts.targetId,
      promptEg: 'قولها بصوت عالي',
      sayTl: tl,
      options: [
        { id: 'ok', label: 'قلتها تمام' },
        { id: 'again', label: 'محتاج أسمع تاني' },
      ],
      correctIndex: 0,
      whyEg: tl,
      skill: 'listening',
      skipSrs: true,
    };
  }

  if (opts.type === 'choose_article') {
    if (!isNounWord(target)) return null;
    const article = articleForWord(target);
    if (!article) return null;
    const options = (['o', 'a', 'os', 'as'] as const).map((a) => ({
      id: a,
      label: a,
    }));
    // Prefer o/a for singular; keep all four for plural targets
    const slim =
      article === 'os' || article === 'as'
        ? options
        : options.filter((o) => o.id === 'o' || o.id === 'a');
    const correctIndex = slim.findIndex((o) => o.id === article);
    return {
      kind: 'micro_check',
      checkType: 'choose_article',
      itemId: opts.targetId,
      promptEg: 'حرف التعريف إيه؟',
      cue: stripArticle(itemTl(target)),
      options: slim,
      correctIndex: correctIndex < 0 ? 0 : correctIndex,
      whyEg: `${article} · ${itemTl(target)}`,
      skill: 'reading',
    };
  }

  if (opts.type === 'complete_phrase') {
    if (target.type !== 'phrase') return null;
    const built = buildCompletePhrase(
      target,
      opts.seenIds,
      opts.byId,
      opts.rand,
    );
    if (!built) return null;
    return {
      kind: 'micro_check',
      checkType: 'complete_phrase',
      itemId: opts.targetId,
      promptEg: 'كمّل الجملة',
      cue: built.cue,
      options: built.options,
      correctIndex: built.correctIndex,
      whyEg: built.whyEg,
      skill: 'reading',
    };
  }

  if (opts.type === 'pick_image') {
    const answerUrl = itemReadyImageUrl(target);
    if (!answerUrl) return null;
    const withImages = pool.filter((id) => {
      if (id === opts.targetId) return false;
      return Boolean(itemReadyImageUrl(opts.byId.get(id)));
    });
    if (withImages.length < 2) return null;
    const distractors = pickDistractorIds(
      opts.targetId,
      withImages,
      2,
      opts.rand,
    );
    if (distractors.length < 2) return null;
    const ids = [opts.targetId, ...distractors];
    const options: VocabFlowOption[] = ids.map((id) => ({
      id,
      label: itemTl(opts.byId.get(id)),
      url: itemReadyImageUrl(opts.byId.get(id)),
    }));
    shuffleInPlace(options, opts.rand);
    const correctIndex = options.findIndex((o) => o.id === opts.targetId);
    return {
      kind: 'micro_check',
      checkType: 'pick_image',
      itemId: opts.targetId,
      promptEg: 'اسمَع واختار الصورة',
      cue: itemTl(target),
      options,
      correctIndex: correctIndex < 0 ? 0 : correctIndex,
      whyEg: `${itemTl(target)} · ${itemAr(target)}`,
      skill: 'listening',
    };
  }

  if (opts.type === 'pick_meaning') {
    const distractors = pickDistractorIds(opts.targetId, pool, 2, opts.rand);
    if (distractors.length < 2) return null;
    const ids = [opts.targetId, ...distractors];
    const options: VocabFlowOption[] = ids.map((id) => ({
      id,
      label: itemAr(opts.byId.get(id)) || id,
    }));
    // Dedup by Arabic meaning
    const seenAr = new Set<string>();
    const deduped = options.filter((o) => {
      const key = o.label.trim();
      if (!key || seenAr.has(key)) return false;
      seenAr.add(key);
      return true;
    });
    if (deduped.length < 3 && !deduped.find((o) => o.id === opts.targetId)) {
      return null;
    }
    while (deduped.length < 3) {
      deduped.push({
        id: `pad_${deduped.length}`,
        label: `خيار ${deduped.length + 1}`,
      });
    }
    shuffleInPlace(deduped, opts.rand);
    const correctIndex = deduped.findIndex((o) => o.id === opts.targetId);
    if (correctIndex < 0) return null;
    return {
      kind: 'micro_check',
      checkType: 'pick_meaning',
      itemId: opts.targetId,
      promptEg: 'المعنى إيه؟',
      cue: itemTl(target),
      options: deduped.slice(0, 3),
      correctIndex,
      whyEg: itemAr(target),
      skill: 'reading',
    };
  }

  if (opts.type === 'pick_tl') {
    const distractors = pickDistractorIds(opts.targetId, pool, 2, opts.rand);
    if (distractors.length < 2) return null;
    const ids = [opts.targetId, ...distractors];
    const options: VocabFlowOption[] = ids.map((id) => ({
      id,
      label: itemTl(opts.byId.get(id)) || id,
    }));
    const seenTl = new Set<string>();
    const deduped = options.filter((o) => {
      const key = o.label.trim().toLowerCase();
      if (!key || seenTl.has(key)) return false;
      seenTl.add(key);
      return true;
    });
    if (deduped.length < 3) return null;
    shuffleInPlace(deduped, opts.rand);
    const correctIndex = deduped.findIndex((o) => o.id === opts.targetId);
    if (correctIndex < 0) return null;
    return {
      kind: 'micro_check',
      checkType: 'pick_tl',
      itemId: opts.targetId,
      promptEg: 'بالبرتغالي؟',
      cue: itemAr(target),
      options: deduped.slice(0, 3),
      correctIndex,
      whyEg: itemTl(target),
      skill: 'reading',
    };
  }

  return null;
}

function nextCheckType(
  preferred: MicroCheckType[],
  lastType: MicroCheckType | null,
  attempt: (t: MicroCheckType) => Extract<VocabFlowSlide, { kind: 'micro_check' }> | null,
): Extract<VocabFlowSlide, { kind: 'micro_check' }> | null {
  const ordered = [
    ...preferred.filter((t) => t !== lastType),
    ...CHECK_ROTATION.filter((t) => t !== lastType && !preferred.includes(t)),
    ...(lastType ? [lastType] : []),
  ];
  for (const t of ordered) {
    const built = attempt(t);
    if (built) return built;
  }
  return null;
}

/**
 * Build the vocab_flow slide list from ordered card ids + story.
 * Pure / code-only — no model.
 */
export function buildVocabFlow(opts: {
  itemIds: string[];
  items: Item[];
  storyLines?: VocabFlowStoryLine[];
  cast?: VocabFlowCast[];
  /** Item ids from earlier days (distractor pool). */
  earlierIds?: string[];
  tipCount?: number;
  rand?: () => number;
}): VocabFlowSlide[] {
  const rand = opts.rand ?? Math.random;
  const byId = new Map(opts.items.map((i) => [i.id, i]));
  const ordered = orderVocabFlowIds({
    candidateIds: opts.itemIds.filter((id) => byId.has(id)),
    items: opts.items.map((i) => ({
      id: i.id,
      type: i.type,
      tl: itemTl(i),
    })),
  });
  // Prefer the page's card order when already story-sorted; re-run only to
  // enforce word-before-phrase within that set.
  const itemIds = ordered.length ? ordered : opts.itemIds.filter((id) => byId.has(id));
  const lines = opts.storyLines ?? [];
  const cast = opts.cast ?? [];
  const earlierIds = opts.earlierIds ?? [];
  const slides: VocabFlowSlide[] = [];
  const seenIds: string[] = [];
  let itemsSinceCheck = 0;
  let lastCheckType: MicroCheckType | null = null;
  let breatherPlaced = false;
  const totalItems = itemIds.length;
  const halfway = Math.ceil(totalItems / 2);

  const emitCheck = (chunkIds: string[]) => {
    if (!chunkIds.length) return;
    const lastId = chunkIds[chunkIds.length - 1]!;
    const lastItem = byId.get(lastId);
    const preferred: MicroCheckType[] = [];
    if (lastItem?.type === 'phrase') preferred.push('complete_phrase');
    if (isNounWord(lastItem)) preferred.push('choose_article');
    preferred.push('pick_meaning', 'pick_tl', 'pick_image', 'say_it');

    const check = nextCheckType(preferred, lastCheckType, (type) =>
      tryBuildCheck({
        type,
        targetId: lastId,
        chunkIds,
        seenIds: [...seenIds],
        earlierIds,
        byId,
        rand,
      }),
    );
    if (check) {
      slides.push(check);
      lastCheckType = check.checkType;
      itemsSinceCheck = 0;
    }
  };

  let chunkIds: string[] = [];

  for (let i = 0; i < itemIds.length; i++) {
    const id = itemIds[i]!;
    const item = byId.get(id);
    slides.push({ kind: 'item', itemId: id });
    seenIds.push(id);
    chunkIds.push(id);
    itemsSinceCheck += 1;

    if (item?.type === 'phrase') {
      const line = firstStoryLineForItem(id, lines);
      if (line) {
        slides.push({
          kind: 'phrase_in_use',
          itemId: id,
          lineIndex: line.index,
          speakerId: line.speaker,
          speakerName: castName(line.speaker, cast),
          tl: line.tl,
          ar: line.ar,
        });
      }
    }

    if (totalItems > 9 && !breatherPlaced && seenIds.length >= halfway) {
      slides.push({
        kind: 'breather',
        seen: seenIds.length,
        total: totalItems,
        chipIds: [...seenIds],
      });
      breatherPlaced = true;
    }

    if (itemsSinceCheck >= 3) {
      emitCheck(chunkIds);
      chunkIds = [];
    }
  }

  // Always end with a check (and never two checks in a row — emitCheck only
  // pushes when it can build one; if the last slide is already a check, skip).
  const last = slides[slides.length - 1];
  if (!last || last.kind !== 'micro_check') {
    const tail = chunkIds.length
      ? chunkIds
      : seenIds.slice(-Math.min(3, seenIds.length));
    emitCheck(tail);
  }

  const tipCount = opts.tipCount ?? 0;
  for (let t = 0; t < tipCount; t++) {
    slides.push({ kind: 'tip', tipIndex: t });
  }

  return slides;
}

export function collectVocabCardIds(blocks: readonly unknown[]): string[] {
  const ids: string[] = [];
  for (const raw of blocks) {
    if (!raw || typeof raw !== 'object') continue;
    const b = raw as { type?: string; items?: unknown };
    if (b.type === 'cards' && Array.isArray(b.items)) {
      for (const id of b.items) {
        if (typeof id === 'string') ids.push(id);
      }
    }
  }
  return [...new Set(ids)];
}
