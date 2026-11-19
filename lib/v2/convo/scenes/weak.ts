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

/**
 * §8.2: after normalize, a keyword matches a message word when exact, or
 * keyword length ≥ 5 and edit distance ≤ 1, or length ≥ 8 and distance ≤ 2.
 * Keywords shorter than 5 letters must match exactly.
 */
export function sceneKeywordMatchesToken(
  keyword: string,
  token: string,
): boolean {
  const k = normalizeSceneText(keyword);
  const t = normalizeSceneText(token);
  if (!k || !t) return false;
  if (k === t) return true;
  if (k.length < 5) return false;
  const dist = levenshtein(k, t);
  if (k.length >= 8) return dist <= 2;
  return dist <= 1;
}

/** True when `message` contains the keyword/phrase (normalized; §8.2 typo-tolerant). */
export function messageContainsKeyword(
  message: string,
  keyword: string,
): boolean {
  const msg = normalizeSceneText(message);
  const k = normalizeSceneText(keyword);
  if (!msg || !k) return false;
  if (k.includes(' ')) return msg.includes(k);
  const tokens = msg.split(/\s+/).filter(Boolean);
  if (tokens.some((t) => t === k)) return true;
  if (tokens.some((t) => sceneKeywordMatchesToken(k, t))) return true;
  return k.length >= 2 && msg.includes(k);
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
