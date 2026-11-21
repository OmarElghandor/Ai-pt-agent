/**
 * Code-built review steps (16 §5.6) — no model calls.
 */

import { estimatedSecondsForType } from './stepTimes';
import type { CoverageSkill } from './coverage';

export type BankItem = {
  id: string;
  type: string;
  tl?: string;
  ar?: string;
  day: number;
  has_card?: boolean;
  image_url?: string | null;
  priority?: string;
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
    recognition: ['fill_blank_choice', 'pick_meaning', 'pick_tl'],
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

/** Build tiles that rebuild the exact sentence + 1–2 distractors. */
export function buildSentenceTiles(
  sentence: string,
  distractors: string[],
): { tiles: string[]; answer: number[] } {
  const parts = sentence
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const extra = distractors
    .filter((d) => d && !parts.includes(d))
    .slice(0, 2);
  // Deterministic order: distractors first (sorted), then parts in order at end indices
  // Simpler reliable approach: tiles = parts + extras; answer = 0..parts.length-1
  const tiles = [...parts, ...extra];
  const answer = parts.map((_, i) => i);
  return { tiles, answer };
}

export function canBuildFindImageBlock(items: BankItem[]): boolean {
  const carded = items.filter((i) => i.has_card && i.image_url);
  return carded.length >= 4;
}

/**
 * Build one step for an item × skill. Prefers crafted practice/both questions.
 */
export function buildReviewStep(input: BuildStepInput): BuiltStep | null {
  const recent = input.recentQuestionIds ?? new Set();
  const cardIds = input.todayCardIds ?? new Set();

  const crafted = preferCrafted(
    input.crafted,
    input.item.id,
    input.skill,
    recent,
  );
  if (crafted) {
    if (cardIds.has(input.item.id) && MEANING_TYPES.has(crafted.type)) {
      // fall through to production/building template
    } else {
      return {
        kind: 'question',
        type: crafted.type,
        item_id: input.item.id,
        lesson_day: input.item.day,
        skill: input.skill,
        estimated_seconds: estimatedSecondsForType(crafted.type),
        payload: { ...crafted, origin: 'crafted' },
      };
    }
  }

  const taught = input.taughtItems.filter((i) => i.day <= input.currentDay);
  const distractors = taught
    .filter((i) => i.id !== input.item.id && i.tl)
    .slice(0, 3);

  if (input.skill === 'building' || input.skill === 'writing') {
    const tl = input.item.tl ?? '';
    if (!tl) return null;
    if (input.skill === 'building') {
      const mistakeTiles = (input.knownMistakeTiles ?? []).filter((t) =>
        taught.some((i) => i.tl?.includes(t) || i.id.includes(t)),
      );
      const { tiles, answer } = buildSentenceTiles(tl, mistakeTiles);
      // Ensure tiles rebuild the sentence
      const rebuilt = answer.map((i) => tiles[i]).join(' ');
      if (rebuilt.replace(/\s+/g, ' ') !== tl.replace(/\s+/g, ' ')) {
        // fallback: no shuffle
        const parts = tl.split(/\s+/);
        return {
          kind: 'question',
          type: 'build_sentence',
          item_id: input.item.id,
          lesson_day: input.item.day,
          skill: 'building',
          estimated_seconds: estimatedSecondsForType('build_sentence'),
          payload: {
            type: 'build_sentence',
            tests: [input.item.id],
            tiles: [...parts, ...(mistakeTiles.slice(0, 2))],
            answer: parts.map((_, i) => i),
            origin: 'code',
          },
        };
      }
      return {
        kind: 'question',
        type: 'build_sentence',
        item_id: input.item.id,
        lesson_day: input.item.day,
        skill: 'building',
        estimated_seconds: estimatedSecondsForType('build_sentence'),
        payload: {
          type: 'build_sentence',
          tests: [input.item.id],
          tiles,
          answer,
          origin: 'code',
        },
      };
    }
    return {
      kind: 'question',
      type: 'translate_write',
      item_id: input.item.id,
      lesson_day: input.item.day,
      skill: 'writing',
      estimated_seconds: estimatedSecondsForType('translate_write'),
      payload: {
        type: 'translate_write',
        tests: [input.item.id],
        prompt_eg: input.item.ar ?? '',
        accepted: [tl],
        origin: 'code',
      },
    };
  }

  if (input.skill === 'listening') {
    if (
      canBuildFindImageBlock(taught.filter((i) => i.day === input.item.day)) &&
      input.item.has_card &&
      input.item.image_url
    ) {
      return {
        kind: 'find_image',
        type: 'listen_pick_image',
        item_id: input.item.id,
        lesson_day: input.item.day,
        skill: 'listening',
        estimated_seconds: estimatedSecondsForType('listen_pick_image'),
        payload: {
          type: 'listen_pick_image',
          tests: [input.item.id],
          options: [
            input.item,
            ...distractPick(taught, input.item.id, 3),
          ].map((i) => ({
            id: i.id,
            image_url: i.image_url,
            correct: i.id === input.item.id,
          })),
          origin: 'code',
        },
      };
    }
    return {
      kind: 'question',
      type: 'listen_meaning',
      item_id: input.item.id,
      lesson_day: input.item.day,
      skill: 'listening',
      estimated_seconds: estimatedSecondsForType('listen_meaning'),
      payload: {
        type: 'listen_meaning',
        tests: [input.item.id],
        options: [
          { id: 'a', label: input.item.ar ?? '', correct: true },
          ...distractPick(taught, input.item.id, 2).map((d, i) => ({
            id: `d${i}`,
            label: d.ar ?? d.tl ?? '',
            correct: false,
          })),
        ],
        origin: 'code',
      },
    };
  }

  if (input.skill === 'recognition') {
    return {
      kind: 'micro_check',
      type: 'pick_meaning',
      item_id: input.item.id,
      lesson_day: input.item.day,
      skill: 'recognition',
      estimated_seconds: estimatedSecondsForType('pick_meaning'),
      payload: {
        type: 'pick_meaning',
        tests: [input.item.id],
        prompt_tl: input.item.tl,
        options: [
          { id: 'a', label: input.item.ar ?? '', correct: true },
          ...distractPick(taught, input.item.id, 2).map((d, i) => ({
            id: `d${i}`,
            label: d.ar ?? '',
            correct: false,
          })),
        ],
        origin: 'code',
      },
    };
  }

  if (input.skill === 'speaking' || input.skill === 'use') {
    return {
      kind: 'question',
      type: 'say_it',
      item_id: input.item.id,
      lesson_day: input.item.day,
      skill: input.skill,
      estimated_seconds: estimatedSecondsForType('say_it'),
      payload: {
        type: 'say_it',
        tests: [input.item.id],
        prompt_eg: input.item.ar ?? '',
        accepted: input.item.tl ? [input.item.tl] : [],
        origin: 'code',
      },
    };
  }

  void distractors;
  return null;
}

function distractPick(
  taught: BankItem[],
  excludeId: string,
  n: number,
): BankItem[] {
  return taught.filter((i) => i.id !== excludeId).slice(0, n);
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
