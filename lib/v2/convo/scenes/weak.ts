/** Weak politeness / filler words — cannot jump ahead to a later goal (§3). */

import { levenshtein } from '@/lib/v2/answers/match';

export const SCENE_WEAK_WORDS = [
  'sim',
  'não',
  'nao',
  'obrigado',
  'obrigada',
  'está bem',
  'esta bem',
  'ok',
  'claro',
  'pode',
  'pode ser',
  'aqui tem',
  'por favor',
  'bom dia',
  'boa tarde',
  // Shared “nothing else / that’s all” closers — current goal only (batch-rp-4).
  'nada',
  'só isto',
  'so isto',
  'é tudo',
  'e tudo',
] as const;

export function normalizeSceneText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const WEAK_SET = new Set(
  SCENE_WEAK_WORDS.map((w) => normalizeSceneText(w)).filter(Boolean),
);

export function isWeakWordOrPhrase(raw: string): boolean {
  const n = normalizeSceneText(raw);
  return Boolean(n) && WEAK_SET.has(n);
}

export type SceneTokenMatchKind = 'exact' | 'fuzzy';

/** Final a/o (or a/e, o/e) swap with the same stem — e.g. fresco ↔ fresca. */
function isGenderEndingSwap(a: string, b: string): boolean {
  if (a.length < 4 || a.length !== b.length) return false;
  if (a.slice(0, -1) !== b.slice(0, -1)) return false;
  const x = a.at(-1);
  const y = b.at(-1);
  if (!x || !y || x === y) return false;
  const pair = new Set([x, y]);
  return (
    (pair.has('a') && pair.has('o')) ||
    (pair.has('a') && pair.has('e')) ||
    (pair.has('o') && pair.has('e'))
  );
}

/**
 * batch-rp-4: after normalize, a keyword matches a message word when exact, or
 * keyword length ≥ 6 and edit distance ≤ 1, or length ≥ 9 and distance ≤ 2.
 * Keywords shorter than 6 letters must match exactly.
 *
 * Equal-length single substitutions are rejected (quarto ↛ quanto, preto/preço
 * already blocked by the 6+ floor) except gender endings (fresco → fresca).
 */
export function sceneKeywordMatchKind(
  keyword: string,
  token: string,
): SceneTokenMatchKind | null {
  const k = normalizeSceneText(keyword);
  const t = normalizeSceneText(token);
  if (!k || !t) return null;
  if (k === t) return 'exact';
  if (k.length < 6) return null;
  const dist = levenshtein(k, t);
  const maxDist = k.length >= 9 ? 2 : 1;
  if (dist <= 0 || dist > maxDist) return null;
  if (k.length !== t.length) return 'fuzzy';
  if (isGenderEndingSwap(k, t)) return 'fuzzy';
  if (k.length >= 9 && dist <= 2) return 'fuzzy';
  return null;
}

/** True when exact or fuzzy (batch-rp-4 typo window). */
export function sceneKeywordMatchesToken(
  keyword: string,
  token: string,
): boolean {
  return sceneKeywordMatchKind(keyword, token) != null;
}

export type SceneKeywordHit = {
  keyword: string;
  token: string;
  kind: SceneTokenMatchKind;
};

/** Best keyword hit in the message (exact preferred over fuzzy). */
export function findKeywordHitInMessage(
  message: string,
  keywords: readonly string[],
): SceneKeywordHit | null {
  const msg = normalizeSceneText(message);
  if (!msg) return null;
  const tokens = msg.split(/\s+/).filter(Boolean);
  // Keep original tokens for accent checks (aligned by index after normalize split).
  const rawTokens = message
    .normalize('NFD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  let fuzzy: SceneKeywordHit | null = null;
  for (const keyword of keywords) {
    const k = normalizeSceneText(keyword);
    if (!k) continue;
    if (k.includes(' ')) {
      if (msg.includes(k)) {
        return { keyword, token: keyword, kind: 'exact' };
      }
      continue;
    }
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      const kind = sceneKeywordMatchKind(keyword, t);
      if (kind === 'exact') {
        return {
          keyword,
          token: rawTokens[i] ?? t,
          kind: 'exact',
        };
      }
      if (kind === 'fuzzy' && !fuzzy) {
        fuzzy = {
          keyword,
          token: rawTokens[i] ?? t,
          kind: 'fuzzy',
        };
      }
    }
  }
  return fuzzy;
}

/** True when `message` contains the keyword/phrase (normalized; typo-tolerant). */
export function messageContainsKeyword(
  message: string,
  keyword: string,
): boolean {
  return findKeywordHitInMessage(message, [keyword]) != null;
}

export function messageHasStrongKeyword(
  message: string,
  keywords: readonly string[],
): boolean {
  for (const kw of keywords) {
    if (isWeakWordOrPhrase(kw)) continue;
    if (messageContainsKeyword(message, kw)) return true;
  }
  return false;
}

export function messageHasAnyKeyword(
  message: string,
  keywords: readonly string[],
): boolean {
  return keywords.some((kw) => messageContainsKeyword(message, kw));
}

/**
 * True when the learner token matches the keyword after accent-stripping,
 * but the lowercased surface still differs (missing accents / cedilla).
 */
export function accentsOrCedillaMissing(
  learnerToken: string,
  keyword: string,
): boolean {
  if (normalizeSceneText(learnerToken) !== normalizeSceneText(keyword)) {
    return false;
  }
  const a = learnerToken.toLowerCase().normalize('NFC');
  const b = keyword.toLowerCase().normalize('NFC');
  return a !== b;
}

/** Replace the first message token that matches `fromToken` (normalized) with `toWord`. */
export function replaceWordInContext(
  sentence: string,
  fromToken: string,
  toWord: string,
): string {
  const fromNorm = normalizeSceneText(fromToken);
  if (!fromNorm || !toWord.trim()) return toWord.trim();

  const parts = sentence.split(/(\s+)/);
  let replaced = false;
  const out = parts.map((part) => {
    if (replaced || !part.trim() || /^\s+$/.test(part)) return part;
    const cleaned = part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (normalizeSceneText(cleaned) !== fromNorm) return part;
    replaced = true;
    const lead = part.match(/^[^\p{L}\p{N}]+/u)?.[0] ?? '';
    const trail = part.match(/[^\p{L}\p{N}]+$/u)?.[0] ?? '';
    let word = toWord;
    if (cleaned[0] && cleaned[0] === cleaned[0]!.toUpperCase()) {
      word = word.charAt(0).toUpperCase() + word.slice(1);
    }
    return `${lead}${word}${trail}`;
  });
  if (!replaced) {
    // Fallback: whole-phrase soft rewrite ending with the right word.
    const trimmed = sentence.trim().replace(/[.?!…]+$/u, '');
    return `${trimmed.replace(/\S+$/u, toWord)}.`.replace(/\s+\./, '.');
  }
  return out.join('');
}
