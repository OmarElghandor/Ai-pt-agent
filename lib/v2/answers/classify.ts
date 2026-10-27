import type { ProgressError } from '@/lib/v2/progress/types';
import { normalizeForCompare } from './normalize';

/** Common Brazilian vs European Portuguese word swaps. */
export const BRAZILIAN_MAP: Record<string, string> = {
  ônibus: 'autocarro',
  celular: 'telemóvel',
  trem: 'comboio',
  suco: 'sumo',
  cafézinho: 'café',
  você: 'tu', // weak signal; kept for list match only when accepted expects tu form
};

export type ClassifiedError = Pick<
  ProgressError,
  'category' | 'scope' | 'wrong' | 'right' | 'item_id' | 'tool_id'
>;

/**
 * Code-first classification. Accent is handled in match.ts before this.
 */
export function classifyMiss(opts: {
  answer: string;
  expected: string;
  item_id?: string;
  tool_id?: string;
}): ClassifiedError | null {
  const ans = opts.answer.trim().toLowerCase();
  const exp = opts.expected.trim().toLowerCase();

  for (const [br, eu] of Object.entries(BRAZILIAN_MAP)) {
    if (
      normalizeForCompare(ans).includes(normalizeForCompare(br)) &&
      normalizeForCompare(exp).includes(normalizeForCompare(eu))
    ) {
      return {
        category: 'vocabulary',
        scope: 'brazilian',
        wrong: opts.answer,
        right: opts.expected,
        item_id: opts.item_id,
        tool_id: opts.tool_id,
      };
    }
  }

  // o/a gender swap on a single known noun
  if (
    (ans === 'o' && exp === 'a') ||
    (ans === 'a' && exp === 'o') ||
    (ans === 'um' && exp === 'uma') ||
    (ans === 'uma' && exp === 'um')
  ) {
    return {
      category: 'grammar',
      scope: 'agreement',
      wrong: opts.answer,
      right: opts.expected,
      item_id: opts.item_id,
      tool_id: opts.tool_id,
    };
  }

  const ansToks = normalizeForCompare(ans).split(/\s+/).filter(Boolean);
  const expToks = normalizeForCompare(exp).split(/\s+/).filter(Boolean);
  if (ansToks.length < expToks.length && expToks.length - ansToks.length <= 2) {
    return {
      category: 'vocabulary',
      scope: 'forgot_word',
      wrong: opts.answer,
      right: opts.expected,
      item_id: opts.item_id,
      tool_id: opts.tool_id,
    };
  }

  return {
    category: 'vocabulary',
    scope: 'wrong_word',
    wrong: opts.answer,
    right: opts.expected,
    item_id: opts.item_id,
    tool_id: opts.tool_id,
  };
}

export function accentError(opts: {
  answer: string;
  expected: string;
  item_id?: string;
  tool_id?: string;
}): ClassifiedError {
  return {
    category: 'spelling',
    scope: 'accent',
    wrong: opts.answer,
    right: opts.expected,
    item_id: opts.item_id,
    tool_id: opts.tool_id,
  };
}
