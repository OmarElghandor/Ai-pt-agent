import type { Problem } from '@/lib/v2/progress/problems';

export type CodeClassifyInput = {
  wrong: string;
  right: string;
  /** Known common-mistake pairs → problem id */
  commonMistakeProblemId?: string | null;
  isBrazilian?: boolean;
  /** Another taught item of same kind, no shared pattern */
  isWordMixup?: boolean;
};

export type CodeClassifyResult =
  | {
      kind: 'problem';
      id: string;
      confidence: 'high';
      by: 'code';
    }
  | { kind: 'none' } // word mix-up → cards only
  | { kind: 'slip'; confidence: 'high'; by: 'code' }
  | { kind: 'need_model' };

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Accent-only difference → spelling.accent when that problem exists. */
export function classifyByCode(
  input: CodeClassifyInput,
  available: Problem[],
): CodeClassifyResult {
  const wrong = norm(input.wrong);
  const right = norm(input.right);
  if (!wrong || !right) return { kind: 'need_model' };

  if (stripAccents(wrong) === stripAccents(right) && wrong !== right) {
    const accent = available.find((p) => p.id === 'spelling.accent');
    if (accent) {
      return {
        kind: 'problem',
        id: accent.id,
        confidence: 'high',
        by: 'code',
      };
    }
  }

  if (input.commonMistakeProblemId) {
    const hit = available.find((p) => p.id === input.commonMistakeProblemId);
    if (hit) {
      return {
        kind: 'problem',
        id: hit.id,
        confidence: 'high',
        by: 'code',
      };
    }
  }

  if (input.isBrazilian) {
    const br = available.find((p) => p.id === 'vocabulary.brazilian');
    if (br) {
      return {
        kind: 'problem',
        id: br.id,
        confidence: 'high',
        by: 'code',
      };
    }
  }

  if (input.isWordMixup) {
    return { kind: 'none' };
  }

  return { kind: 'need_model' };
}
