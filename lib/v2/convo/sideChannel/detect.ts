import { isArabicOnly } from '@/lib/v2/answers/arabicOnly';

const ARABIC_RE = /[\u0600-\u06FF]/
const LATIN_RE = /[A-Za-zÀ-ÿ]/

/** Short replies that stay on the character path even if Latin. */
const LATIN_PASS_THROUGH = new Set(['ok', 'sim', 'yes', 'no', 'nao', 'não']);

/**
 * English function / signal words. ≥2 hits + more EN than PT → English side channel.
 */
const ENGLISH_SIGNAL = new Set([
  'i',
  'you',
  'how',
  'what',
  'can',
  'say',
  'the',
  'is',
  'do',
  'does',
  'did',
  'my',
  'in',
  'to',
  'mean',
  'means',
  'word',
  'words',
  'like',
  'love',
  'want',
  'need',
  'train',
  'times',
  'week',
  'please',
  'this',
  'that',
  'a',
  'an',
  'of',
  'for',
  'with',
  'it',
  'me',
  'we',
  'they',
  'am',
  'are',
  'was',
  'were',
  'have',
  'has',
  'would',
  'could',
  'should',
  'translate',
  'portuguese',
  'english',
]);

const PORTUGUESE_SIGNAL = new Set([
  'eu',
  'tu',
  'voce',
  'você',
  'ele',
  'ela',
  'nos',
  'nós',
  'eles',
  'elas',
  'o',
  'a',
  'os',
  'as',
  'de',
  'da',
  'do',
  'das',
  'dos',
  'em',
  'para',
  'por',
  'com',
  'sim',
  'nao',
  'não',
  'sou',
  'estou',
  'tenho',
  'vou',
  'quero',
  'gosto',
  'treino',
  'treinar',
  'fazes',
  'fazer',
  'muito',
  'uma',
  'um',
  'vezes',
  'semana',
]);

/** True when the text contains at least one Arabic letter. */
export function hasArabicScript(text: string): boolean {
  return ARABIC_RE.test(text.trim());
}

/** True when the text has both Arabic and Latin letters. */
export function isMixedScript(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return ARABIC_RE.test(t) && LATIN_RE.test(t);
}

function latinTokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/[a-z]+/g) ?? [];
}

/**
 * Latin-only English (side channel): ≥2 English signal words and more EN than PT.
 * «ok» / «sim» never count.
 */
export function isEnglishSideChannel(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (hasArabicScript(t)) return false;
  if (!LATIN_RE.test(t)) return false;

  const compact = t
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (LATIN_PASS_THROUGH.has(compact)) return false;

  const tokens = latinTokens(t);
  if (tokens.length === 0) return false;

  let en = 0;
  let pt = 0;
  for (const tok of tokens) {
    if (ENGLISH_SIGNAL.has(tok)) en += 1;
    if (PORTUGUESE_SIGNAL.has(tok)) pt += 1;
  }
  return en >= 2 && en > pt;
}

/**
 * Side-channel gate (09 §6): Arabic / mixed script, or detected English.
 * Portuguese answers and short ok/sim stay on the character path.
 */
export function needsSideChannel(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return (
    isArabicOnly(t) ||
    isMixedScript(t) ||
    hasArabicScript(t) ||
    isEnglishSideChannel(t)
  );
}

export { isArabicOnly };
