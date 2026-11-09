import { BRAZILIAN_MAP } from '@/lib/v2/answers/classify';

/** Extra Brazilian forms from generation checks (not all in BRAZILIAN_MAP). */
const EXTRA_BRAZILIAN = [
  'ônibus',
  'onibus',
  'trem',
  'celular',
  'banheiro',
  'café da manhã',
  'cafe da manha',
];

const ENGLISH_WORDS = [
  'the',
  'you',
  'please',
  'thanks',
  'thank',
  'hello',
  'sorry',
  'what',
  'where',
  'how',
  'yes',
  'okay',
  'ok',
  'right',
  'left',
  'turn',
];

/** Phase-1 Module A reaction cap (09 §5.3). */
export const CONVO_REACTION_MAX_WORDS = 8;

export type ConvoOutputIssue = 'brazilian' | 'english' | 'length';

export function findBrazilianLeak(text: string): string | null {
  const lower = text.toLowerCase();
  for (const br of Object.keys(BRAZILIAN_MAP)) {
    if (new RegExp(`\\b${escapeRe(br)}\\b`, 'i').test(lower)) return br;
  }
  for (const br of EXTRA_BRAZILIAN) {
    if (lower.includes(br)) return br;
  }
  // Sentence-initial você (generationChecks rule)
  if (/^\s*você\b/i.test(text)) return 'você';
  return null;
}

export function findEnglishLeak(text: string): string | null {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  for (const w of words) {
    if (ENGLISH_WORDS.includes(w)) return w;
  }
  return null;
}

export function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Words that look "unknown" for معناها؟ — Latin tokens not in a tiny
 * allowlist of common A1 function words. Never causes regenerate.
 */
const KNOWN_TINY = new Set([
  'a',
  'o',
  'as',
  'os',
  'de',
  'do',
  'da',
  'e',
  'ou',
  'não',
  'sim',
  'eu',
  'tu',
  'ele',
  'ela',
  'um',
  'uma',
  'em',
  'no',
  'na',
  'por',
  'para',
  'com',
  'obrigado',
  'obrigada',
  'olá',
  'oi',
  'hmm',
  'ah',
  'ok',
]);

export function findUnknownWords(
  text: string,
  knownExtra: string[] = [],
): string[] {
  const extra = new Set(knownExtra.map((w) => w.toLowerCase()));
  const words = text.match(/[\p{L}']+/gu) ?? [];
  const out: string[] = [];
  for (const w of words) {
    const lower = w.toLowerCase();
    if (KNOWN_TINY.has(lower) || extra.has(lower)) continue;
    // Skip if it looks like a candidate id fragment
    if (/^q_/.test(lower)) continue;
    out.push(w);
  }
  return out;
}
