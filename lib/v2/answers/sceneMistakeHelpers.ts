/**
 * Pure helpers for role-play mistake pairs (batch-rp-5).
 * Kept free of Mongo / classifier imports so scene UI can import them safely.
 */
import { createHash } from 'node:crypto';
import { accentError, classifyMiss } from '@/lib/v2/answers/classify';
import { stripAccents } from '@/lib/v2/answers/normalize';

export const ROLEPLAY_SOURCE = 'roleplay' as const;

/** Lowercased + trimmed pair key; accents kept («cartao→cartão»). */
export function sceneMistakeKey(wrong: string, right: string): string {
  return `${wrong.trim().toLowerCase()}→${right.trim().toLowerCase()}`;
}

export function sceneToolId(sceneId: string, goalId: string): string {
  return `scene:${sceneId}:${goalId}`;
}

/** Deterministic UUID for answer_id (session × turn × key). */
export function sceneMistakeAnswerId(opts: {
  sessionId: string;
  turnKey: string;
  mistakeKey: string;
}): string {
  const hex = createHash('sha256')
    .update(`${opts.sessionId}|${opts.turnKey}|${opts.mistakeKey}`)
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function tokenizeWords(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean);
}

/**
 * Word-level pairs for a correction card (same diff the card shows).
 * Punctuation-only / capitalization-only → empty.
 */
export function diffWordPairs(
  original: string,
  corrected: string,
): Array<{ wrong: string; right: string }> {
  const a = tokenizeWords(original);
  const b = tokenizeWords(corrected);
  if (!a.length && !b.length) return [];

  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^\p{L}\p{N}]/gu, '');

  if (a.length === b.length) {
    const pairs: Array<{ wrong: string; right: string }> = [];
    for (let i = 0; i < a.length; i++) {
      const w = a[i]!;
      const r = b[i]!;
      if (w.toLowerCase() === r.toLowerCase()) continue;
      if (norm(w) === norm(r) && w.toLowerCase() === r.toLowerCase()) continue;
      pairs.push({ wrong: w, right: r });
    }
    return pairs;
  }

  const pairs: Array<{ wrong: string; right: string }> = [];
  const usedB = new Set<number>();
  for (const w of a) {
    const exact = b.findIndex(
      (r, j) => !usedB.has(j) && r.toLowerCase() === w.toLowerCase(),
    );
    if (exact >= 0) {
      usedB.add(exact);
      continue;
    }
    const accentHit = b.findIndex(
      (r, j) =>
        !usedB.has(j) &&
        norm(r) === norm(w) &&
        r.toLowerCase() !== w.toLowerCase(),
    );
    if (accentHit >= 0) {
      usedB.add(accentHit);
      pairs.push({ wrong: w, right: b[accentHit]! });
    }
  }
  const leftoverA = a.filter(
    (w) =>
      !b.some((r) => r.toLowerCase() === w.toLowerCase()) &&
      !pairs.some((p) => p.wrong.toLowerCase() === w.toLowerCase()),
  );
  const leftoverB = b.filter((_, j) => !usedB.has(j));
  const n = Math.min(leftoverA.length, leftoverB.length);
  for (let i = 0; i < n; i++) {
    const w = leftoverA[i]!;
    const r = leftoverB[i]!;
    if (w.toLowerCase() === r.toLowerCase()) continue;
    pairs.push({ wrong: w, right: r });
  }
  return pairs;
}

export function categoryForPair(
  wrong: string,
  right: string,
): {
  category: 'grammar' | 'vocabulary' | 'spelling' | 'pronunciation';
  scope: string;
} {
  const w = wrong.trim().toLowerCase();
  const r = right.trim().toLowerCase();
  if (w && r && stripAccents(w) === stripAccents(r) && w !== r) {
    return accentError({ answer: wrong, expected: right });
  }
  const miss = classifyMiss({ answer: wrong, expected: right });
  if (miss) {
    return { category: miss.category, scope: miss.scope };
  }
  return { category: 'vocabulary', scope: 'wrong_word' };
}
