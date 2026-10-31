import { readFileSync } from 'node:fs';
import path from 'node:path';

export type FunctionWordsFile = {
  lang: string;
  tokens: string[];
  phrases: string[];
};

const cache = new Map<string, FunctionWordsFile>();

function defaultPath(lang: string): string {
  return path.join(process.cwd(), 'content/v2/plan', `${lang}.function-words.json`);
}

export function loadFunctionWords(
  lang = 'pt-PT',
  filePath = defaultPath(lang),
): FunctionWordsFile {
  const cached = cache.get(filePath);
  if (cached) return cached;
  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as FunctionWordsFile;
  cache.set(filePath, raw);
  return raw;
}

/** Test helper. */
export function resetFunctionWordsCache(): void {
  cache.clear();
}

export function normToken(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export type FunctionWordSets = {
  tokens: Set<string>;
  /** Multi-word phrases, longest first, already normalized. */
  phrases: string[];
};

export function functionWordSets(lang = 'pt-PT'): FunctionWordSets {
  const file = loadFunctionWords(lang);
  const tokens = new Set(file.tokens.map(normToken));
  const phrases = [...file.phrases]
    .map((p) => normToken(p.trim()))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  return { tokens, phrases };
}

/**
 * Strip multi-word function phrases from a line (normalized space),
 * then return remaining tokens (punctuation stripped).
 */
export function contentTokensFromTl(
  tl: string,
  fw: FunctionWordSets,
  opts?: { excludeNames?: Set<string> },
): string[] {
  let text = tl
    .replace(/[…]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  let lower = normToken(text);
  for (const phrase of fw.phrases) {
    if (!phrase) continue;
    const re = new RegExp(`(?:^|\\s)${escapeRe(phrase)}(?=\\s|$)`, 'gi');
    lower = lower.replace(re, ' ');
  }
  const names = opts?.excludeNames;
  return lower
    .split(/\s+/)
    .map((t) => t.replace(/^[,.;:!?«»"']+|[,.;:!?«»"']+$/g, ''))
    .filter(Boolean)
    .filter((t) => !fw.tokens.has(t))
    .filter((t) => !names?.has(t));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
