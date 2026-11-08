import { contentTokens } from '@/lib/v2/convo/free/offTopic';

/** Stopwords that never count as goal keywords. */
const STOP = new Set([
  'the',
  'and',
  'com',
  'para',
  'por',
  'uma',
  'uns',
  'umas',
  'dos',
  'das',
  'nos',
  'nas',
  'que',
  'nao',
  'não',
  'sim',
  'mais',
  'menos',
  'muito',
  'muita',
  'eles',
  'elas',
  'voce',
  'você',
  'este',
  'esta',
  'isso',
  'aqui',
  'ali',
  'bem',
  'mal',
]);

function allTokens(text: string): string[] {
  const raw = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  return (raw.match(/[a-z0-9]+/g) ?? []).filter((w) => w.length >= 2);
}

/**
 * Derive keywords from example / chip strings (content tokens, de-duped).
 * Falls back to shorter tokens when chips are all stopwords / blanks.
 */
export function keywordsFromExamples(examples: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (tok: string) => {
    if (STOP.has(tok) || seen.has(tok)) return;
    seen.add(tok);
    out.push(tok);
  };
  for (const ex of examples) {
    for (const tok of contentTokens(ex)) push(tok);
  }
  if (out.length === 0) {
    for (const ex of examples) {
      for (const tok of allTokens(ex)) push(tok);
    }
  }
  return out;
}
