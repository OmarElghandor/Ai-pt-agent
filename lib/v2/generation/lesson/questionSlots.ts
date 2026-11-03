import type { Item } from '@/lib/v2/content/items';
import type { Question } from '@/lib/v2/content/lesson';
import { findImageTargetIds } from '@/lib/v2/findImage/buildRounds';
import type { OutlinePagePlan, OutlineResult } from './stages/types';
import {
  IMAGE_QUESTION_TYPES,
  imageFallbackType,
  skillForQuestionType,
  type QuestionType,
} from './questionTypes';

export type QuestionUse = 'lesson' | 'practice' | 'both';

export type PlannedSlot = {
  slot_id: string;
  type: QuestionType;
  skill: ReturnType<typeof skillForQuestionType>;
  tests: string;
  page_index: number;
  page_id: string;
  use: QuestionUse;
  /** Item image key or story scene key for image question types. */
  image_ref?: string;
  /** Same-skill type the player uses until image_ref is ready. */
  fallback_type?: QuestionType;
  /** True when image media may not be ready yet (player uses fallback_type). */
  image_fallback?: boolean;
};

export type SlotPlanResult = {
  slots: PlannedSlot[];
  warnings: string[];
};

export type ImageReadyFn = (itemId: string) => boolean;

/** Default day question count (00 §7, 2026-11-01). */
const FIXED_SLOTS = 12;
/** Only when a day still has >15 core items (legacy / pre-split). */
const LARGE_SLOTS = 14;
/** Core + real-world extras (00 §4 / §7, 2026-11-03). */
const MAX_WITH_RW = 15;
const RW_SLOT_MAX = 3;

const QUOTA = {
  listening: { min: 3, max: 4 },
  writing: { min: 3, max: 4 },
  speaking: { min: 3, max: 4 },
  grammar: { min: 2, max: 3 },
  reading: { min: 0, max: 2 },
} as const;

function itemTl(item: Item): string {
  return 'tl' in item && typeof item.tl === 'string' ? item.tl : '';
}

function normalizeTl(tl: string): string {
  return tl
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[!.?,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isCoreTestable(item: Item): boolean {
  // Real-world exposure phrases get dedicated extra slots (00 §4) —
  // never planned as regular core day slots.
  if ((item as { real_world?: boolean }).real_world) return false;
  if (item.id.startsWith('phrase.rw.')) return false;
  if (item.type === 'pattern') return true;
  if (item.type === 'word' || item.type === 'phrase' || item.type === 'sentence') {
    return Boolean(itemTl(item));
  }
  return false;
}

function isDerivedEx(id: string): boolean {
  return /^pattern\..+\.ex\.\d+$/.test(id);
}

/** Ids that share coverage with a tested id (root + same normalized tl). */
export function coverageAliases(testId: string, bank: Item[]): Set<string> {
  const out = new Set<string>([testId]);
  const root = testId.replace(/\.ex\.\d+$/, '');
  if (root !== testId) out.add(root);
  const item = bank.find((i) => i.id === testId);
  const tl = item ? normalizeTl(itemTl(item)) : '';
  if (!tl) return out;
  for (const other of bank) {
    if (!isCoreTestable(other)) continue;
    if (normalizeTl(itemTl(other)) === tl) {
      out.add(other.id);
      const otherRoot = other.id.replace(/\.ex\.\d+$/, '');
      if (otherRoot !== other.id) out.add(otherRoot);
    }
  }
  return out;
}

/** Prefer a core phrase with the same tl as a derived pattern.ex.N. */
export function preferCorePhraseForTests(
  testsId: string,
  bank: Item[],
  priorityIds?: Set<string>,
): string {
  if (!isDerivedEx(testsId)) return testsId;
  const derived = bank.find((i) => i.id === testsId);
  if (!derived) return testsId;
  const tl = normalizeTl(itemTl(derived));
  if (!tl) return testsId;
  const match = bank.find(
    (i) =>
      i.type === 'phrase' &&
      !isDerivedEx(i.id) &&
      normalizeTl(itemTl(i)) === tl &&
      (!priorityIds || priorityIds.has(i.id)),
  );
  return match?.id ?? testsId;
}

/** Prefer a derived pattern.ex.N for non-grammar types; keep root for grammar. */
export function testableIdForSlot(
  itemId: string,
  type: QuestionType,
  bank: Item[],
): string {
  if (!itemId.startsWith('pattern.') || isDerivedEx(itemId)) {
    return itemId;
  }
  if (type === 'fill_blank_choice' || type === 'build_sentence') {
    const derived = bank.find(
      (i) =>
        i.type === 'phrase' &&
        i.id.startsWith(`${itemId}.ex.`) &&
        isDerivedEx(i.id),
    );
    return derived?.id ?? itemId;
  }
  const derived = bank.find(
    (i) =>
      i.type === 'phrase' &&
      i.id.startsWith(`${itemId}.ex.`) &&
      isDerivedEx(i.id),
  );
  return derived?.id ?? itemId;
}

function introducedPage(
  itemId: string,
  outline: OutlinePagePlan[],
): { page_index: number; page_id: string } {
  for (const p of outline) {
    if (p.role === 'intro' || p.role === 'test') continue;
    if (p.introduces.includes(itemId)) {
      return { page_index: p.index, page_id: p.page_id };
    }
    // Derived pattern examples count as introduced with the pattern root
    const root = itemId.replace(/\.ex\.\d+$/, '');
    if (root !== itemId && p.introduces.includes(root)) {
      return { page_index: p.index, page_id: p.page_id };
    }
  }
  const firstDetail = outline.find(
    (p) => p.role !== 'intro' && p.role !== 'test' && !(p.index === 0 && p.preset === 'story'),
  );
  return {
    page_index: firstDetail?.index ?? 1,
    page_id: firstDetail?.page_id ?? 'p1',
  };
}

/**
 * Coverage order: core phrases → core words → story/bank remainder → recycle last.
 * Derived pattern.ex.N ids are omitted (covered via grammar / tl alias).
 */
function buildOrderedIds(opts: {
  bank: Item[];
  storyItemOrder?: string[];
  priorityIds?: string[];
}): string[] {
  const bank = opts.bank;
  const byId = new Map(bank.map((i) => [i.id, i]));
  const priority = opts.priorityIds ?? [];
  const prioritySet = new Set(priority);
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (id: string) => {
    if (seen.has(id)) return;
    const item = byId.get(id);
    if (!item || !isCoreTestable(item)) return;
    if (item.type === 'pattern') return; // grammar phase
    if (isDerivedEx(id)) return;
    seen.add(id);
    out.push(id);
  };

  const phrases = priority.filter((id) => byId.get(id)?.type === 'phrase');
  const words = priority.filter((id) => byId.get(id)?.type === 'word');
  for (const id of phrases) push(id);
  for (const id of words) push(id);

  if (opts.storyItemOrder?.length) {
    for (const id of opts.storyItemOrder) push(id);
  }

  // Remaining bank testables that are still priority (e.g. sentences)
  for (const id of priority) push(id);

  // Recycle / extras last (anything testable not in priority)
  for (const item of bank) {
    if (prioritySet.has(item.id)) continue;
    push(item.id);
  }

  return out;
}

/** Exactly 12 slots; 14 only when core bank still exceeds 15 items. */
function slotTargetFor(coreItemCount: number): number {
  return coreItemCount > 15 ? LARGE_SLOTS : FIXED_SLOTS;
}

function isMustTestItem(item: Item | undefined): boolean {
  if (!item) return false;
  return item.type === 'phrase' || item.type === 'pattern' || item.type === 'sentence';
}

function countSkill(slots: PlannedSlot[], skill: string): number {
  return slots.filter((s) => s.skill === skill).length;
}

function itemCounts(slots: PlannedSlot[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of slots) {
    m.set(s.tests, (m.get(s.tests) ?? 0) + 1);
  }
  return m;
}

function hasTypeTests(slots: PlannedSlot[], type: string, tests: string): boolean {
  return slots.some((s) => s.type === type && s.tests === tests);
}

/** How many slots already cover this id (root + same-tl aliases). */
function coveredCountFor(
  slots: PlannedSlot[],
  id: string,
  bank: Item[],
): number {
  const aliases = coverageAliases(id, bank);
  let n = 0;
  for (const s of slots) {
    const covered = coverageAliases(s.tests, bank);
    for (const a of aliases) {
      if (covered.has(a)) {
        n += 1;
        break;
      }
    }
  }
  return n;
}

function canAdd(
  slots: PlannedSlot[],
  type: QuestionType,
  tests: string,
  opts: {
    maxTotal: number;
    bank: Item[];
    forCoverage?: boolean;
    /** Items already covered by the day find-image step — no listen_pick_image. */
    findImageIds?: Set<string>;
  },
): boolean {
  if (slots.length >= opts.maxTotal) return false;
  if (hasTypeTests(slots, type, tests)) return false;
  if (coveredCountFor(slots, tests, opts.bank) >= 2) return false;
  if (
    type === 'listen_pick_image' &&
    opts.findImageIds?.has(tests)
  ) {
    return false;
  }
  const skill = skillForQuestionType(type);
  // Reading has a hard validation max — never exceed it.
  if (skill === 'reading' && countSkill(slots, skill) >= QUOTA.reading.max) {
    return false;
  }
  if (!opts.forCoverage && countSkill(slots, skill) >= QUOTA[skill].max) {
    return false;
  }
  return true;
}

function pushSlot(
  slots: PlannedSlot[],
  partial: Omit<PlannedSlot, 'slot_id' | 'skill'> & { skill?: PlannedSlot['skill'] },
): void {
  const skill = partial.skill ?? skillForQuestionType(partial.type);
  slots.push({
    ...partial,
    skill,
    slot_id: `s${slots.length}`,
  });
}

/** Core phrase ids that appear on the phrases page (avoid for grammar .ex pick). */
function phrasesPageCoreIds(outlinePages: OutlinePagePlan[]): Set<string> {
  const out = new Set<string>();
  for (const p of outlinePages) {
    if (p.preset !== 'phrases') continue;
    for (const id of p.introduces ?? []) out.add(id);
  }
  return out;
}

/**
 * Prefer a pattern.ex.N that is not the phrases-page copied item
 * (e.g. Chamo-me Rita, not phrase.my_name_is / Omar).
 */
function grammarExampleId(
  patternId: string,
  bank: Item[],
  phrasesPageIds: Set<string>,
  preferLater = false,
): string {
  const derived = bank
    .filter(
      (i) =>
        i.type === 'phrase' &&
        i.id.startsWith(`${patternId}.ex.`) &&
        isDerivedEx(i.id),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const pattern = bank.find((i) => i.id === patternId && i.type === 'pattern');
  const exampleIds =
    pattern && pattern.type === 'pattern' && Array.isArray(pattern.examples)
      ? pattern.examples.filter((id): id is string => typeof id === 'string')
      : derived.map((d) => d.id);

  const notOnPhrases = (id: string) => {
    if (phrasesPageIds.has(id)) return false;
    // Same TL as a phrases-page core phrase → skip for build_sentence preferLater
    const item = bank.find((i) => i.id === id);
    if (!item) return true;
    const tl = normalizeTl(itemTl(item));
    if (!tl) return true;
    for (const pid of phrasesPageIds) {
      const p = bank.find((i) => i.id === pid);
      if (p && normalizeTl(itemTl(p)) === tl) return false;
    }
    return true;
  };

  const pool = exampleIds.filter((id) => bank.some((i) => i.id === id));
  if (preferLater) {
    const alt = pool.find(notOnPhrases);
    if (alt) return alt;
  }
  return (
    pool[0] ||
    derived[0]?.id ||
    testableIdForSlot(patternId, 'fill_blank_choice', bank) ||
    patternId
  );
}

/**
 * Plan exactly 12 day-level question slots (14 if core items > 15).
 * Must-test: phrases + patterns. Words fill remaining slots only.
 * Image types stay planned even when media is not ready (fallback_type on slot).
 */
/**
 * Extra 2–3 real-world slots atop the core plan (max 15 total).
 * Mix: listen_meaning, situation_choice, ≤1 say_it. Each phrase id once.
 */
export function planRealWorldSlots(opts: {
  phrases: Array<{ id: string }>;
  outlinePages: OutlinePagePlan[];
  coreSlotCount: number;
  hide?: boolean;
}): PlannedSlot[] {
  if (opts.hide || opts.phrases.length < 3) return [];
  const room = Math.max(0, MAX_WITH_RW - opts.coreSlotCount);
  if (room < 1) return [];
  // Prefer 2–3; still allow a single seat when core is 14 (room=1).
  const count = Math.min(RW_SLOT_MAX, room, opts.phrases.length);
  if (count < 1) return [];

  const rwPage = opts.outlinePages.find((p) => p.preset === 'real_world');
  const page_index = rwPage?.index ?? opts.outlinePages.at(-1)?.index ?? 0;
  const page_id = rwPage?.page_id ?? 'p_real_world';

  const types: QuestionType[] = [];
  if (count >= 1) types.push('listen_meaning');
  if (count >= 2) types.push('situation_choice');
  if (count >= 3) types.push('say_it');

  const slots: PlannedSlot[] = [];
  const used = new Set<string>();
  for (let i = 0; i < types.length; i++) {
    const phrase = opts.phrases.find((p) => !used.has(p.id));
    if (!phrase) break;
    used.add(phrase.id);
    pushSlot(slots, {
      type: types[i]!,
      tests: phrase.id,
      page_index,
      page_id,
      use: 'both',
    });
  }
  return slots;
}

export function planQuestionSlots(opts: {
  outline: OutlineResult;
  items: Item[];
  /** Item ids in first-appearance order from the story (optional). */
  storyItemOrder?: string[];
  /** Today's brief.core_items ids — covered before recycle. */
  priorityIds?: string[];
  /** Returns true when a picture for this item (or story scene) is ready. */
  imageReady?: ImageReadyFn;
  /** Prefer build_sentence for this pattern id (e.g. pattern.chamo_me). */
  preferBuildSentenceFor?: string[];
  /**
   * Soft real_world handoff phrases. When ≥3 and page not hidden, append
   * 2–3 extra slots (max total 15). Source of truth from handoffs.real_world.
   */
  rwPhrases?: Array<{ id: string }>;
  /** When true, skip rw extras (job skipped / hide). */
  rwHide?: boolean;
}): SlotPlanResult {
  const warnings: string[] = [];
  const bank = opts.items;
  const outlinePages = [...opts.outline.pages].sort((a, b) => a.index - b.index);
  const priorityIds = opts.priorityIds ?? [];
  const prioritySet = new Set(priorityIds);
  const phrasesPageIds = phrasesPageCoreIds(outlinePages);
  const coreCount =
    priorityIds.length ||
    bank.filter((i) => isCoreTestable(i) && !isDerivedEx(i.id)).length;
  const maxTotal = slotTargetFor(coreCount);
  const orderedIds = buildOrderedIds({
    bank,
    storyItemOrder: opts.storyItemOrder,
    priorityIds,
  });
  // Phrases/sentences first (must-test), then words for fillers.
  const mustCoverIds = orderedIds.filter((id) => {
    const item = bank.find((i) => i.id === id);
    return item != null && isMustTestItem(item) && item.type !== 'pattern';
  });
  const wordIds = orderedIds.filter((id) => {
    const item = bank.find((i) => i.id === id);
    return item?.type === 'word';
  });
  const patterns = bank.filter((i) => i.type === 'pattern');
  const imageReady = opts.imageReady ?? (() => false);
  const preferBuild = new Set(opts.preferBuildSentenceFor ?? ['pattern.chamo_me']);

  const slots: PlannedSlot[] = [];
  const findImageIds = new Set(findImageTargetIds(bank));
  const addOpts = { maxTotal, bank, findImageIds };

  /** Keep image types; attach fallback metadata instead of swapping the type. */
  const imageMeta = (
    wanted: QuestionType,
    tests: string,
  ): Pick<PlannedSlot, 'image_ref' | 'fallback_type' | 'image_fallback'> => {
    if (!IMAGE_QUESTION_TYPES.has(wanted)) return {};
    const ready = imageReady(tests);
    const fb = imageFallbackType(wanted);
    if (!ready) {
      warnings.push(`image_fallback: ${wanted} keeps type, fallback=${fb} for ${tests}`);
    }
    return {
      image_ref: tests,
      fallback_type: fb,
      image_fallback: !ready,
    };
  };

  // 1) Grammar: ≥2 per pattern (fatal coverage later).
  // Always test pattern via .ex items — never remap to phrase.my_name_is.
  for (const pattern of patterns) {
    const page = introducedPage(pattern.id, outlinePages);
    const types: QuestionType[] = preferBuild.has(pattern.id)
      ? ['build_sentence', 'fill_blank_choice']
      : ['fill_blank_choice', 'build_sentence'];
    for (const type of types) {
      if (countSkill(slots, 'grammar') >= QUOTA.grammar.max) break;
      const tests = grammarExampleId(
        pattern.id,
        bank,
        phrasesPageIds,
        type === 'build_sentence',
      );
      if (!canAdd(slots, type, tests, { ...addOpts, forCoverage: true })) continue;
      pushSlot(slots, {
        type,
        tests,
        page_index: page.page_index,
        page_id: page.page_id,
        use: 'lesson',
      });
    }
  }

  // Ensure grammar min with any remaining pattern .ex
  while (countSkill(slots, 'grammar') < QUOTA.grammar.min && slots.length < maxTotal) {
    const candidate = patterns.find((p) => {
      const t = grammarExampleId(p.id, bank, phrasesPageIds, false);
      return canAdd(slots, 'fill_blank_choice', t, { ...addOpts, forCoverage: true });
    });
    if (!candidate) break;
    const type: QuestionType = preferBuild.has(candidate.id)
      ? 'build_sentence'
      : 'fill_blank_choice';
    const tests = grammarExampleId(
      candidate.id,
      bank,
      phrasesPageIds,
      type === 'build_sentence',
    );
    const page = introducedPage(candidate.id, outlinePages);
    if (!canAdd(slots, type, tests, { ...addOpts, forCoverage: true })) break;
    pushSlot(slots, {
      type,
      tests,
      page_index: page.page_index,
      page_id: page.page_id,
      use: 'both',
    });
  }

  // 2) Cover every must-test phrase/sentence at least once (whole-lesson rotation)
  const coverTypes: QuestionType[] = [
    'listen_meaning',
    'translate_write',
    'say_it',
    'listen_pick_tl',
    'fill_blank_write',
    'reply_speak',
    'dictation',
    'reply_write',
    'read_aloud',
    'read_meaning',
  ];

  let coverIdx = 0;
  for (const id of mustCoverIds) {
    if (slots.length >= maxTotal) break;
    const item = bank.find((i) => i.id === id);
    if (!item || !isCoreTestable(item)) continue;
    if (coveredCountFor(slots, id, bank) >= 1) continue;

    const isPriority = prioritySet.size === 0 || prioritySet.has(id);
    let placed = false;
    for (let attempt = 0; attempt < coverTypes.length && !placed; attempt++) {
      const type = coverTypes[(coverIdx + attempt) % coverTypes.length]!;
      if (!canAdd(slots, type, id, { ...addOpts, forCoverage: isPriority })) {
        continue;
      }
      const role =
        item.type === 'phrase' && 'role' in item
          ? (item as { role?: string }).role
          : undefined;
      if (
        (type === 'say_it' ||
          type === 'reply_speak' ||
          type === 'translate_write' ||
          type === 'reply_write' ||
          type === 'describe_image_speak' ||
          type === 'describe_image_write') &&
        role === 'heard'
      ) {
        continue;
      }
      const page = introducedPage(id, outlinePages);
      pushSlot(slots, {
        type,
        tests: id,
        page_index: page.page_index,
        page_id: page.page_id,
        use: 'both',
        ...imageMeta(type, id),
      });
      coverIdx += 1;
      placed = true;
    }
  }

  // 3) Top up skill quotas to mins (words + leftover phrases)
  const topUp: { skill: keyof typeof QUOTA; types: QuestionType[] }[] = [
    { skill: 'listening', types: ['listen_meaning', 'listen_pick_tl', 'dictation'] },
    { skill: 'writing', types: ['translate_write', 'fill_blank_write', 'reply_write'] },
    { skill: 'speaking', types: ['say_it', 'reply_speak', 'read_aloud'] },
    { skill: 'reading', types: ['read_meaning'] },
  ];
  const fillerIds = [...mustCoverIds, ...wordIds];

  for (const { skill, types } of topUp) {
    while (countSkill(slots, skill) < QUOTA[skill].min && slots.length < maxTotal) {
      let added = false;
      for (const id of fillerIds) {
        const item = bank.find((i) => i.id === id);
        if (!item || item.type === 'pattern') continue;
        for (const type of types) {
          if (skillForQuestionType(type) !== skill) continue;
          if (!canAdd(slots, type, id, addOpts)) continue;
          const page = introducedPage(id, outlinePages);
          pushSlot(slots, {
            type,
            tests: id,
            page_index: page.page_index,
            page_id: page.page_id,
            use: 'both',
            ...imageMeta(type, id),
          });
          added = true;
          break;
        }
        if (added) break;
      }
      if (!added) break;
    }
  }

  // 4) Fill exactly to slot target (prefer words as multi-item distractor hosts)
  while (slots.length < maxTotal) {
    let added = false;
    for (const id of [...wordIds, ...mustCoverIds]) {
      if (slots.length >= maxTotal) break;
      const item = bank.find((i) => i.id === id);
      if (!item || item.type === 'pattern') continue;
      for (const type of [
        'listen_pick_tl',
        'listen_meaning',
        'dictation',
        'read_aloud',
        'translate_write',
        'say_it',
        'read_meaning',
      ] as QuestionType[]) {
        if (!canAdd(slots, type, id, addOpts)) continue;
        const page = introducedPage(id, outlinePages);
        pushSlot(slots, {
          type,
          tests: id,
          page_index: page.page_index,
          page_id: page.page_id,
          use: 'both',
          ...imageMeta(type, id),
        });
        added = true;
        break;
      }
      if (added) break;
    }
    if (!added) break;
  }

  // 5) Cover any still-untested must-test phrases (skill-max bypass)
  {
    for (const id of mustCoverIds) {
      if (slots.length >= maxTotal) break;
      const item = bank.find((i) => i.id === id);
      if (!item) continue;
      if (prioritySet.size > 0 && !prioritySet.has(id)) continue;
      if (coveredCountFor(slots, id, bank) >= 1) continue;
      for (const type of [
        'listen_meaning',
        'translate_write',
        'say_it',
        'dictation',
        'fill_blank_write',
        'reply_speak',
        'read_aloud',
      ] as QuestionType[]) {
        const role =
          item.type === 'phrase' && 'role' in item
            ? (item as { role?: string }).role
            : undefined;
        if (
          (type === 'say_it' ||
            type === 'reply_speak' ||
            type === 'translate_write' ||
            type === 'reply_write') &&
          role === 'heard'
        ) {
          continue;
        }
        if (!canAdd(slots, type, id, { ...addOpts, forCoverage: true })) continue;
        const page = introducedPage(id, outlinePages);
        pushSlot(slots, {
          type,
          tests: id,
          page_index: page.page_index,
          page_id: page.page_id,
          use: 'both',
          ...imageMeta(type, id),
        });
        break;
      }
    }
  }

  if (slots.length !== maxTotal) {
    warnings.push(`slot_count ${slots.length} ≠ target ${maxTotal}`);
  }
  for (const skill of ['listening', 'writing', 'speaking', 'grammar'] as const) {
    if (countSkill(slots, skill) < QUOTA[skill].min) {
      warnings.push(
        `skill_quota ${skill} ${countSkill(slots, skill)} < ${QUOTA[skill].min}`,
      );
    }
  }

  // 6) Real-world extras (on top of core 12/14, capped at 15)
  const rwExtra = planRealWorldSlots({
    phrases: opts.rwPhrases ?? [],
    outlinePages,
    coreSlotCount: slots.length,
    hide: opts.rwHide,
  });
  for (const s of rwExtra) {
    // Re-number slot_ids after core plan
    pushSlot(slots, {
      type: s.type,
      tests: s.tests,
      page_index: s.page_index,
      page_id: s.page_id,
      use: s.use,
    });
  }
  if (rwExtra.length) {
    warnings.push(`rw_slots +${rwExtra.length} (total ${slots.length})`);
  }

  return { slots, warnings };
}

export type QuotaCounts = {
  listening: number;
  writing: number;
  speaking: number;
  grammar: number;
  reading: number;
  total: number;
};

export function countQuestionSkills(
  questions: Array<{ skill: string }>,
): QuotaCounts {
  const counts: QuotaCounts = {
    listening: 0,
    writing: 0,
    speaking: 0,
    grammar: 0,
    reading: 0,
    total: questions.length,
  };
  for (const q of questions) {
    if (q.skill in counts && q.skill !== 'total') {
      counts[q.skill as keyof Omit<QuotaCounts, 'total'>] += 1;
    }
  }
  return counts;
}

/**
 * Coverage checks for the day question set.
 * Fatals: count ≠ planned target, skill mins unmet, untested phrases/patterns.
 * Warnings: untested words, reading over max.
 */
export function validateDayQuestionQuotas(
  questions: Question[],
  coreItemIds: string[],
  opts?: { items?: Item[]; maxTotal?: number; plannedCount?: number },
): { ok: boolean; fatals: string[]; warnings: string[] } {
  const fatals: string[] = [];
  const warnings: string[] = [];
  const bank = opts?.items ?? [];
  const target =
    opts?.plannedCount ??
    opts?.maxTotal ??
    slotTargetFor(
      coreItemIds.filter((id) => {
        const item = bank.find((i) => i.id === id);
        return item != null && isCoreTestable(item);
      }).length || coreItemIds.length,
    );
  const counts = countQuestionSkills(questions);
  if (counts.total === 0) {
    fatals.push('total 0 questions');
  } else if (counts.total !== target) {
    fatals.push(`total ${counts.total} ≠ target ${target}`);
  }
  if (counts.listening < QUOTA.listening.min) {
    fatals.push(`listening ${counts.listening} < ${QUOTA.listening.min}`);
  }
  if (counts.writing < QUOTA.writing.min) {
    fatals.push(`writing ${counts.writing} < ${QUOTA.writing.min}`);
  }
  if (counts.speaking < QUOTA.speaking.min) {
    fatals.push(`speaking ${counts.speaking} < ${QUOTA.speaking.min}`);
  }
  if (counts.grammar < QUOTA.grammar.min) {
    fatals.push(`grammar ${counts.grammar} < ${QUOTA.grammar.min}`);
  }
  if (counts.reading > QUOTA.reading.max) {
    warnings.push(`reading ${counts.reading} > ${QUOTA.reading.max}`);
  }

  const tested = new Set<string>();
  const typeTests = new Set<string>();
  const perItem = new Map<string, number>();
  for (const q of questions) {
    const tests = Array.isArray(q.tests) ? q.tests.map(String) : [];
    for (const id of tests) {
      for (const a of coverageAliases(id, bank)) {
        tested.add(a);
      }
      perItem.set(id, (perItem.get(id) ?? 0) + 1);
    }
    const key = `${q.type}::${tests.join(',')}`;
    if (typeTests.has(key)) {
      fatals.push(`duplicate (type, tests)=${key}`);
    }
    typeTests.add(key);
  }
  for (const [id, n] of perItem) {
    if (id.startsWith('phrase.rw.') || bank.find((i) => i.id === id && (i as { real_world?: boolean }).real_world)) {
      if (n > 1) fatals.push(`rw item ${id} tested ${n} times (>1)`);
    } else if (n > 2) {
      fatals.push(`item ${id} tested ${n} times (>2)`);
    }
  }

  for (const id of coreItemIds) {
    if (tested.has(id)) continue;
    const item = bank.find((i) => i.id === id);
    if (isMustTestItem(item) || item?.type === 'pattern') {
      fatals.push(`untested ${item?.type ?? 'item'} ${id}`);
    } else if (item?.type === 'word') {
      warnings.push(`untested word ${id}`);
    }
  }

  const patterns = coreItemIds.filter(
    (id) => id.startsWith('pattern.') && !/\.ex\.\d+$/.test(id),
  );
  const exampleIdsFor = (pid: string): Set<string> => {
    const set = new Set<string>();
    const pat = bank.find((i) => i.id === pid && i.type === 'pattern');
    if (pat && pat.type === 'pattern' && Array.isArray(pat.examples)) {
      for (const ex of pat.examples) {
        if (typeof ex === 'string') {
          set.add(ex);
          for (const a of coverageAliases(ex, bank)) set.add(a);
        }
      }
    }
    for (const i of bank) {
      if (i.id.startsWith(`${pid}.ex.`)) {
        set.add(i.id);
        for (const a of coverageAliases(i.id, bank)) set.add(a);
      }
    }
    return set;
  };
  for (const pid of patterns) {
    const examples = exampleIdsFor(pid);
    const n = questions.filter((q) => {
      if (q.skill !== 'grammar') return false;
      const tests = Array.isArray(q.tests) ? q.tests.map(String) : [];
      return tests.some(
        (t) =>
          t === pid ||
          t.startsWith(`${pid}.`) ||
          t.replace(/\.ex\.\d+$/, '') === pid ||
          examples.has(t),
      );
    }).length;
    if (n < 2) fatals.push(`pattern ${pid} has ${n} grammar questions (<2)`);
  }

  return { ok: fatals.length === 0, fatals, warnings };
}
