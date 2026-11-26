/**
 * Code-built review steps (16 §5.6) — no model calls.
 */

import { practiceQuestionId } from '@/lib/v2/review/questions';
import { estimatedSecondsForType } from './stepTimes';
import type { CoverageSkill } from './coverage';
import {
  chatOption,
  chatSkillFor,
  hashSeed,
  normalizeCraftedForChat,
  seededShuffle,
} from './chatQuestion';

export type BankItem = {
  id: string;
  type: string;
  tl?: string;
  ar?: string;
  day: number;
  has_card?: boolean;
  image_url?: string | null;
  priority?: string;
  /** Pattern example item ids (patterns have no sentence of their own). */
  examples?: string[];
  /** Derived pattern example (pattern.x.ex.n). */
  derived?: boolean;
};

export type CraftedQuestion = {
  id: string;
  type: string;
  tests: string[];
  use?: 'lesson' | 'practice' | 'both';
  prompt_eg?: string;
  options?: unknown;
  tiles?: string[];
  answer?: unknown;
};

export type BuiltStep = {
  kind: 'question' | 'micro_check' | 'find_image';
  type: string;
  item_id: string;
  lesson_day: number;
  skill: CoverageSkill;
  estimated_seconds: number;
  /** Deterministic shared question id (16 §9.1) for code-built steps. */
  question_id?: string;
  /** Payload the existing QuestionSession / FindImage / micro UI can render. */
  payload: Record<string, unknown>;
};

export type BuildStepInput = {
  item: BankItem;
  skill: CoverageSkill;
  /** All taught items up to current day (for distractors). */
  taughtItems: BankItem[];
  currentDay: number;
  crafted?: CraftedQuestion[];
  /** Item ids already in today's cards → never meaning questions. */
  todayCardIds?: Set<string>;
  /** Question ids answered in the last 3 days. */
  recentQuestionIds?: Set<string>;
  /** Flagged question ids — never returned. */
  flaggedQuestionIds?: Set<string>;
  knownMistakeTiles?: string[];
};

const MEANING_TYPES = new Set([
  'listen_meaning',
  'read_meaning',
  'pick_meaning',
  'listen_pick_tl',
  'listen_pick_image',
]);

function preferCrafted(
  crafted: CraftedQuestion[] | undefined,
  itemId: string,
  skill: CoverageSkill,
  recentIds: Set<string>,
): CraftedQuestion | null {
  if (!crafted?.length) return null;
  const skillTypes: Record<CoverageSkill, string[]> = {
    listening: ['listen_meaning', 'listen_pick_tl', 'listen_pick_image', 'dictation'],
    writing: ['translate_write', 'fill_blank_write', 'dictation'],
    speaking: ['say_it', 'reply_speak'],
    building: ['build_sentence'],
    recognition: ['fill_blank_choice', 'pick_meaning', 'pick_tl', 'read_meaning'],
    use: ['reply_write', 'reply_speak', 'say_it'],
  };
  const allowed = new Set(skillTypes[skill] ?? []);
  for (const q of crafted) {
    if (q.use === 'lesson') continue;
    if (!q.tests?.includes(itemId)) continue;
    if (!allowed.has(q.type)) continue;
    if (recentIds.has(q.id)) continue;
    return q;
  }
  return null;
}

/**
 * Tiles that rebuild the exact sentence + 1–2 distractors, shuffled
 * deterministically (never left in answer order). `answer` lists the tile
 * indices in sentence order.
 */
export function buildSentenceTiles(
  sentence: string,
  distractors: string[],
  seed = sentence,
): { tiles: string[]; answer: number[] } {
  const parts = sentence.trim().split(/\s+/).filter(Boolean);
  const extra = distractors.filter((d) => d && !parts.includes(d)).slice(0, 2);
  const pool = [
    ...parts.map((text, i) => ({ text, at: i })),
    ...extra.map((text) => ({ text, at: -1 })),
  ];
  let order = seededShuffle(pool, `tiles:${seed}`);
  // A shuffle that leaves the sentence in place teaches nothing — rotate it.
  const inPlace = order
    .filter((t) => t.at >= 0)
    .every((t, i) => t.at === i);
  if (inPlace && order.length > 1) order = [...order.slice(1), order[0]!];
  const tiles = order.map((t) => t.text);
  const answer = parts.map((_, i) => order.findIndex((t) => t.at === i));
  return { tiles, answer };
}

export function canBuildFindImageBlock(items: BankItem[]): boolean {
  const carded = items.filter((i) => i.has_card && i.image_url);
  return carded.length >= 4;
}

/** Hint = the first word only, never the answer (role-play hint rule). */
function firstWordHint(tl: string): string {
  const words = tl.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return '';
  return `بتبدأ بـ ${words[0]} …`;
}

/** Fewest words a sentence needs for a tile question to mean anything. */
const MIN_TILE_WORDS = 3;

function wordCount(tl: string): number {
  return tl.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * The item a step actually tests. Patterns have no sentence of their own, so
 * they use one of their example sentences (rotated by skill).
 */
function resolveTestItem(
  item: BankItem,
  skill: CoverageSkill,
  taught: BankItem[],
): BankItem | null {
  if (item.type !== 'pattern') return item.tl ? item : null;
  const exIds = item.examples ?? [];
  const examples = exIds
    .map((id) => taught.find((t) => t.id === id))
    .filter((t): t is BankItem => Boolean(t?.tl && t.ar));
  if (examples.length) {
    const pick = examples[hashSeed(`${item.id}:${skill}`) % examples.length]!;
    return { ...pick, id: item.id, day: item.day };
  }
  return item.tl && item.ar ? item : null;
}

/**
 * Distractors of the same kind (phrases with phrases, words with words), with
 * a non-empty, distinct label, from taught days only. Deterministic.
 */
function pickDistractors(
  taught: BankItem[],
  target: BankItem,
  field: 'ar' | 'tl',
  n: number,
): BankItem[] {
  const isPhraseLike = (i: BankItem) =>
    i.type === 'phrase' || i.type === 'sentence' || wordCount(i.tl ?? '') >= 3;
  const targetPhrase = isPhraseLike(target);
  // Compare normalised labels: «اسمي عمر» and «اسمي عُمر.» are the same option.
  const seen = new Set([normLabel(target[field] ?? '')]);
  const pool = taught.filter((i) => {
    const label = (i[field] ?? '').trim();
    if (!label || i.id === target.id || i.type === 'pattern') return false;
    return true;
  });
  const ranked = [
    ...seededShuffle(
      pool.filter((i) => isPhraseLike(i) === targetPhrase && i.day === target.day),
      `d1:${target.id}:${field}`,
    ),
    ...seededShuffle(
      pool.filter((i) => isPhraseLike(i) === targetPhrase && i.day !== target.day),
      `d2:${target.id}:${field}`,
    ),
    ...seededShuffle(
      pool.filter((i) => isPhraseLike(i) !== targetPhrase),
      `d3:${target.id}:${field}`,
    ),
  ];
  const out: BankItem[] = [];
  for (const i of ranked) {
    const label = normLabel(i[field] ?? '');
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(i);
    if (out.length >= n) break;
  }
  return out;
}

/** Shuffled options with the answer index. Null when there aren't 2 distractors. */
function choiceOptions(
  target: BankItem,
  distractors: BankItem[],
  field: 'ar' | 'tl',
  seed: string,
): { options: Array<{ ar?: string; tl?: string; label: string; id: string }>; answer: number } | null {
  if (distractors.length < 2) return null;
  const rows = [target, ...distractors].map((i) => {
    const label = (i[field] ?? '').trim();
    return { ...chatOption(label), id: i.id };
  });
  const shuffled = seededShuffle(rows, `opts:${seed}`);
  return {
    options: shuffled,
    answer: shuffled.findIndex((r) => r.id === target.id),
  };
}

/**
 * Build one step for an item × skill. Prefers crafted practice/both questions
 * (normalised for the chat); otherwise a code template that always has an
 * instruction, real distractors and a shuffled answer.
 */
export function buildReviewStep(input: BuildStepInput): BuiltStep | null {
  return buildReviewStepVariants(input)[0] ?? null;
}

/** Labels compared without accents, harakat, punctuation and case. */
export function normLabel(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ًͯ-ٰٟ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase();
}

/**
 * Every question form that can test this item × skill, best first: the
 * lesson's own question (if any), then code templates. The session builder
 * picks the form that keeps the session varied (fewest of its type so far,
 * never the same form as the item's other step).
 */
export function buildReviewStepVariants(input: BuildStepInput): BuiltStep[] {
  const recent = input.recentQuestionIds ?? new Set();
  const flagged = input.flaggedQuestionIds ?? new Set();
  const cardIds = input.todayCardIds ?? new Set();
  // Never pull distractors from future days
  const taught = input.taughtItems.filter((i) => i.day <= input.currentDay);
  const out: BuiltStep[] = [];

  const crafted = preferCrafted(
    input.crafted,
    input.item.id,
    input.skill,
    recent,
  );
  if (crafted && !flagged.has(crafted.id) && !recent.has(crafted.id)) {
    const meaningOnCardItem =
      cardIds.has(input.item.id) && MEANING_TYPES.has(crafted.type);
    const chat = meaningOnCardItem
      ? null
      : normalizeCraftedForChat(crafted as Record<string, unknown>, (id) =>
          taught.find((t) => t.id === id),
        );
    if (chat) {
      out.push({
        kind: 'question',
        type: crafted.type,
        item_id: input.item.id,
        lesson_day: input.item.day,
        skill: input.skill,
        estimated_seconds: estimatedSecondsForType(crafted.type),
        question_id: crafted.id,
        payload: { ...chat, origin: 'crafted', question_id: crafted.id },
      });
    }
    // Unrenderable or meaning-on-card → code templates only.
  }

  const target = resolveTestItem(input.item, input.skill, taught);
  if (!target?.tl) return out;
  const tl = target.tl.trim();
  const ar = (target.ar ?? '').trim();
  const words = tl.split(/\s+/).filter(Boolean);

  const make = (
    type: string,
    kind: BuiltStep['kind'],
    payload: Record<string, unknown>,
  ): BuiltStep => {
    const question_id = codeQuestionId({ type, item: target, skill: input.skill });
    return {
      kind,
      type,
      item_id: input.item.id,
      lesson_day: input.item.day,
      skill: input.skill,
      estimated_seconds: estimatedSecondsForType(type),
      question_id,
      payload: {
        type,
        skill: chatSkillFor(type, input.skill),
        tests: [input.item.id],
        origin: 'code',
        question_id,
        ...payload,
      },
    };
  };
  const add = (s: BuiltStep | null) => {
    if (s && !out.some((o) => o.type === s.type)) out.push(s);
  };

  // ── Forms ──────────────────────────────────────────────────────────────
  /** Reading = translation: read the Portuguese, pick the Arabic meaning. */
  const pickMeaning = (): BuiltStep | null => {
    if (!ar) return null;
    const opts = choiceOptions(target, pickDistractors(taught, target, 'ar', 2), 'ar', `read:${target.id}`);
    if (!opts) return null;
    return make('pick_meaning', 'micro_check', {
      prompt_tl: tl,
      options: opts.options,
      answer: opts.answer,
      accepted: [tl],
    });
  };
  /** Reading the other way: Arabic meaning → pick the Portuguese. */
  const pickTl = (): BuiltStep | null => {
    if (!ar) return null;
    const opts = choiceOptions(target, pickDistractors(taught, target, 'tl', 2), 'tl', `picktl:${target.id}`);
    if (!opts) return null;
    return make('pick_tl', 'micro_check', {
      prompt_ar: ar,
      options: opts.options,
      answer: opts.answer,
      accepted: [tl],
    });
  };
  /** Writing = translation: Arabic meaning → type the Portuguese. */
  const translate = (): BuiltStep | null => {
    if (!ar) return null;
    return make('translate_write', 'question', {
      situation_eg: `اكتب بالبرتغالي: «${ar}»`,
      accepted: [tl],
      hint: firstWordHint(tl),
    });
  };
  /** One word missing from the sentence, meaning as the cue. */
  const blankIndex = (): number => {
    let best = -1;
    words.forEach((w, i) => {
      const len = normLabel(w).length;
      if (len >= 3 && (best < 0 || len > normLabel(words[best]!).length)) best = i;
    });
    return best;
  };
  const fillBlankWrite = (): BuiltStep | null => {
    if (words.length < 3 || !ar) return null;
    const bi = blankIndex();
    if (bi < 0) return null;
    const missing = words[bi]!.replace(/[.,!?;:]+$/, '');
    const trail = words[bi]!.slice(missing.length);
    const template = words.map((w, i) => (i === bi ? `___${trail}` : w)).join(' ');
    return make('fill_blank_write', 'question', {
      prompt_eg: 'كمّل الكلمة الناقصة',
      prompt_tl: template,
      think_eg: `«${ar}»`,
      accepted: [missing],
    });
  };
  const fillBlankChoice = (): BuiltStep | null => {
    if (words.length < 3 || !ar) return null;
    const bi = blankIndex();
    if (bi < 0) return null;
    const missing = words[bi]!.replace(/[.,!?;:]+$/, '');
    const trail = words[bi]!.slice(missing.length);
    const seen = new Set([normLabel(missing)]);
    const pool = seededShuffle(
      taught
        .filter((t) => t.id !== target.id && t.tl)
        .flatMap((t) => t.tl!.split(/\s+/))
        .map((w) => w.replace(/[.,!?;:¿¡]+/g, ''))
        .filter((w) => normLabel(w).length >= 3),
      `blank:${target.id}`,
    );
    const wrong: string[] = [];
    for (const w of pool) {
      if (seen.has(normLabel(w))) continue;
      seen.add(normLabel(w));
      wrong.push(w);
      if (wrong.length === 2) break;
    }
    if (wrong.length < 2) return null;
    const rows = seededShuffle(
      [missing, ...wrong].map((label, i) => ({ ...chatOption(label), id: String(i) })),
      `blankopts:${target.id}`,
    );
    return make('fill_blank_choice', 'question', {
      prompt_tl: words.map((w, i) => (i === bi ? `___${trail}` : w)).join(' '),
      rule_chip: `«${ar}»`,
      options: rows,
      answer: rows.findIndex((r) => r.id === '0'),
      accepted: [tl],
    });
  };
  const buildSentence = (): BuiltStep | null => {
    if (words.length < MIN_TILE_WORDS || !ar) return null;
    const mistakeTiles = allowedDistractorTiles(
      input.knownMistakeTiles ?? [],
      taught,
      input.currentDay,
    );
    const { tiles, answer } = buildSentenceTiles(tl, mistakeTiles, target.id);
    return make('build_sentence', 'question', {
      prompt_eg: `رتّب الجملة: «${ar}»`,
      tiles,
      answer,
      accepted: [tl],
      hint: firstWordHint(tl),
    });
  };
  const listenMeaning = (): BuiltStep | null => {
    if (!ar) return null;
    const opts = choiceOptions(target, pickDistractors(taught, target, 'ar', 2), 'ar', `listen:${target.id}`);
    if (!opts) return null;
    return make('listen_meaning', 'question', {
      prompt_eg: 'اسمع… معناها إيه؟',
      options: opts.options,
      answer: opts.answer,
      accepted: [tl],
    });
  };
  const listenPickTl = (): BuiltStep | null => {
    const opts = choiceOptions(target, pickDistractors(taught, target, 'tl', 2), 'tl', `listentl:${target.id}`);
    if (!opts) return null;
    return make('listen_pick_tl', 'question', {
      prompt_eg: 'سمعت أنهي جملة؟',
      options: opts.options,
      answer: opts.answer,
      accepted: [tl],
    });
  };
  const dictation = (): BuiltStep | null => {
    if (words.length < 2 || words.length > 7) return null;
    return make('dictation', 'question', {
      prompt_eg: 'اكتب اللي سمعته',
      accepted: [tl],
    });
  };
  const findImage = (): BuiltStep | null => {
    if (
      !canBuildFindImageBlock(taught.filter((i) => i.day === input.item.day)) ||
      !input.item.has_card ||
      !input.item.image_url
    ) {
      return null;
    }
    const others = seededShuffle(
      taught.filter((i) => i.id !== input.item.id && i.has_card && i.image_url),
      `img:${input.item.id}`,
    ).slice(0, 3);
    if (others.length !== 3) return null;
    const rows = seededShuffle(
      [input.item, ...others].map((i) => ({
        id: i.id,
        image_url: i.image_url,
        tl: i.tl,
        ar: i.ar,
        label: i.tl ?? '',
        correct: i.id === input.item.id,
      })),
      `imgopts:${input.item.id}`,
    );
    return make('listen_pick_image', 'find_image', {
      prompt_eg: 'اسمع واختار الصورة',
      options: rows,
      answer: rows.findIndex((r) => r.correct),
      accepted: [tl],
    });
  };
  const sayIt = (): BuiltStep | null => {
    if (!ar) return null;
    return make('say_it', 'question', {
      situation_eg: `قول بالبرتغالي: «${ar}»`,
      accepted: [tl],
      hint: firstWordHint(tl),
    });
  };

  // ── One picture → the word (pick / write / say) ─────────────────────────
  // Only for single words with a ready picture of their own: a phrase's
  // picture is a scene, so it can't name one answer.
  const hasOwnPicture =
    Boolean(input.item.has_card && input.item.image_url) &&
    input.item.type !== 'phrase' &&
    input.item.type !== 'sentence' &&
    input.item.type !== 'pattern' &&
    words.length <= 3;
  const imageUrl = input.item.image_url ?? null;
  /** Nouns are taught with their article; also accept the bare noun. */
  const imageAccepted = (): string[] => {
    const bare = tl.replace(/^(o|a|os|as|um|uma)\s+/i, '');
    return bare !== tl ? [tl, bare] : [tl];
  };
  const imagePick = (): BuiltStep | null => {
    if (!hasOwnPicture) return null;
    const opts = choiceOptions(target, pickDistractors(taught, target, 'tl', 2), 'tl', `imgpick:${target.id}`);
    if (!opts) return null;
    return make('image_pick_tl', 'question', {
      image_url: imageUrl,
      prompt_eg: 'إيه اللي في الصورة؟',
      options: opts.options,
      answer: opts.answer,
      accepted: [tl],
    });
  };
  const imageWrite = (): BuiltStep | null => {
    if (!hasOwnPicture) return null;
    return make('image_write', 'question', {
      image_url: imageUrl,
      prompt_eg: 'اكتب بالبرتغالي اللي في الصورة',
      accepted: imageAccepted(),
      hint: firstWordHint(tl),
    });
  };
  const imageSay = (): BuiltStep | null => {
    if (!hasOwnPicture) return null;
    return make('image_say', 'question', {
      image_url: imageUrl,
      prompt_eg: 'قول بالبرتغالي اللي في الصورة',
      accepted: imageAccepted(),
    });
  };

  // ── Forms per coverage skill (best first) ──────────────────────────────
  const inCards = cardIds.has(input.item.id);
  const forms: Array<() => BuiltStep | null> =
    input.skill === 'listening'
      ? [findImage, listenMeaning, listenPickTl, dictation]
      : input.skill === 'writing'
        ? [translate, imageWrite, fillBlankWrite, dictation]
        : input.skill === 'building'
          ? words.length >= MIN_TILE_WORDS
            ? [buildSentence, fillBlankChoice, fillBlankWrite]
            : [pickMeaning, pickTl, translate] // 1–2 words: reading instead
          : input.skill === 'recognition'
            ? inCards
              ? [imageWrite, translate, pickTl] // already in today's cards: no meaning question
              : hasOwnPicture
                ? [imagePick, pickMeaning, pickTl]
                : [pickMeaning, pickTl, fillBlankChoice]
            : input.skill === 'speaking' || input.skill === 'use'
              ? hasOwnPicture
                ? [imageSay, sayIt, translate]
                : [sayIt, translate]
              : [];
  for (const f of forms) add(f());
  return out;
}

function codeQuestionId(opts: {
  type: string;
  item: BankItem;
  skill: CoverageSkill;
}): string {
  return practiceQuestionId({
    target_lang: 'pt-PT',
    type: opts.type,
    item_ids: [opts.item.id],
    source_id: `code:${opts.skill}:${opts.item.id}:${opts.item.tl ?? ''}`,
  });
}

/**
 * Distractor tiles: known mistake forms, or tokens from taught (≤ current day) items.
 * Never from future-day content.
 */
export function allowedDistractorTiles(
  knownMistakeTiles: string[],
  taughtItems: BankItem[],
  currentDay: number,
): string[] {
  const taught = taughtItems.filter((i) => i.day <= currentDay);
  const taughtTokens = new Set(
    taught.flatMap((i) => (i.tl ?? '').split(/\s+/).filter(Boolean)),
  );
  const known = new Set(
    ['me', 'de', 'teu', 'você', 'a gente'].concat(knownMistakeTiles),
  );
  const out: string[] = [];
  for (const t of knownMistakeTiles) {
    if (!t) continue;
    // Known mistake forms are always allowed; taught tokens also allowed
    if (known.has(t) || taughtTokens.has(t)) {
      if (!out.includes(t)) out.push(t);
    }
  }
  return out.slice(0, 2);
}

/** Persist a code-built step into the shared question store (idempotent). */
export async function persistBuiltStep(
  step: BuiltStep,
): Promise<BuiltStep> {
  if (step.payload.origin !== 'code') return step;
  const { ensurePracticeQuestion } = await import(
    '@/lib/v2/review/questions'
  );
  const itemIds = Array.isArray(step.payload.tests)
    ? (step.payload.tests as string[])
    : [step.item_id];
  const patternIds = itemIds.filter((id) => id.startsWith('pattern.'));
  const wordIds = itemIds.filter((id) => !id.startsWith('pattern.'));
  const record = await ensurePracticeQuestion({
    id: step.question_id,
    type: step.type,
    skill: step.skill,
    item_ids: wordIds,
    pattern_ids: patternIds,
    source_id: `code:${step.skill}:${step.item_id}`,
    lesson_day: step.lesson_day,
    content: step.payload,
  });
  return {
    ...step,
    question_id: record.id,
    payload: { ...step.payload, question_id: record.id },
  };
}

/** Group find-image rounds into a block of up to 6. */
export function groupFindImageBlock(
  items: BankItem[],
  maxRounds = 6,
): BuiltStep[] {
  if (!canBuildFindImageBlock(items)) return [];
  const carded = items.filter((i) => i.has_card && i.image_url).slice(0, maxRounds);
  return carded.map((item) => ({
    kind: 'find_image' as const,
    type: 'listen_pick_image',
    item_id: item.id,
    lesson_day: item.day,
    skill: 'listening' as const,
    estimated_seconds: estimatedSecondsForType('listen_pick_image'),
    payload: {
      type: 'listen_pick_image',
      tests: [item.id],
      origin: 'code',
    },
  }));
}
