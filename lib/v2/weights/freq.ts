/**
 * Frequency-list helpers (17 §10 / content/v2/frequency README).
 * Code only — never written by a model.
 */

const ARTICLE_PREFIX_RE = /^(o|a|os|as|um|uma|uns|umas)$/i;
/** Closed-class / noise tokens skipped when picking the rarest content word. */
const SKIP_TOKENS = new Set([
  'o',
  'a',
  'os',
  'as',
  'um',
  'uma',
  'uns',
  'umas',
  'de',
  'do',
  'da',
  'dos',
  'das',
  'em',
  'no',
  'na',
  'nos',
  'nas',
  'por',
  'para',
  'com',
  'sem',
  'e',
  'ou',
  'que',
  'se',
  'me',
  'te',
  'lhe',
  'vos',
  'lhes',
  'eu',
  'tu',
  'ele',
  'ela',
  'nós',
  'eles',
  'elas',
  'você',
  'vocês',
  'já',
  'não',
  'sim',
  'mais',
  'menos',
  'muito',
  'muita',
  'muitos',
  'muitas',
  'pouco',
  'também',
  'só',
  'isto',
  'isso',
  'aquilo',
  'este',
  'esta',
  'esse',
  'essa',
  'aquele',
  'aquela',
  'meu',
  'minha',
  'teu',
  'tua',
  'seu',
  'sua',
  'favor',
]);

/** Synthetic rank for curated 1000-palavras hits with no corpus rank → +6 band. */
export const PALAVRAS_FALLBACK_RANK = 2000;

/** Normalize a surface form for frequency lookup. */
export function normalizeFreqWord(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/[…?!.,;:"«»“”'/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Head word for a single-word freq hint: first content token.
 * Verbs / words use the same path so "o galão" → "galão".
 */
export function headWordForFreq(tl: string): string {
  const tokens = contentTokens(tl);
  return tokens[0] ?? normalizeFreqWord(tl).split(/\s+/)[0] ?? '';
}

/** Content tokens of a TL string (articles / closed class dropped). */
export function contentTokens(tl: string): string[] {
  const cleaned = normalizeFreqWord(tl);
  if (!cleaned) return [];
  return cleaned
    .split(/\s+/)
    .filter((t) => t && !ARTICLE_PREFIX_RE.test(t) && !SKIP_TOKENS.has(t));
}

/** In-memory lookup map: normalized word → 1-based rank. */
export type FreqRankMap = Map<string, number>;

export function buildFreqRankMap(
  rows: Iterable<{ word: string; rank: number }>,
): FreqRankMap {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = normalizeFreqWord(row.word);
    if (!key) continue;
    const rank = Number(row.rank);
    if (!Number.isFinite(rank) || rank < 1) continue;
    const prev = map.get(key);
    if (prev == null || rank < prev) map.set(key, rank);
  }
  return map;
}

/**
 * Look up rank for a TL surface.
 * Single token: full form then head. Multi-word: rarest content word
 * (highest rank among matched tokens), per frequency README.
 */
export function lookupFreqRank(
  tl: string,
  freqMap: FreqRankMap,
): number | null {
  if (!freqMap.size) return null;
  const full = normalizeFreqWord(tl);
  if (full && !full.includes(' ') && freqMap.has(full)) {
    return freqMap.get(full)!;
  }

  const tokens = contentTokens(tl);
  if (!tokens.length) {
    const head = headWordForFreq(tl);
    return head && freqMap.has(head) ? freqMap.get(head)! : null;
  }

  let rarest: number | null = null;
  for (const t of tokens) {
    const rank = freqMap.get(t);
    if (rank == null) continue;
    if (rarest == null || rank > rarest) rarest = rank;
  }
  if (rarest != null) return rarest;

  const head = tokens[0]!;
  return freqMap.has(head) ? freqMap.get(head)! : null;
}

/**
 * True if the item's TL (or any content token / head) appears in the
 * curated 1000-palavras set (normalized tl surfaces and freq_heads).
 */
export function inPalavrasSet(tl: string, palavras: Set<string>): boolean {
  if (!palavras.size) return false;
  const full = normalizeFreqWord(tl);
  if (full && palavras.has(full)) return true;
  for (const t of contentTokens(tl)) {
    if (palavras.has(t)) return true;
  }
  const head = headWordForFreq(tl);
  return Boolean(head && palavras.has(head));
}

/** Build the palavras membership set from the curated JSON entries. */
export function buildPalavrasSet(
  entries: Iterable<{ tl?: string; freq_heads?: string[] }>,
): Set<string> {
  const set = new Set<string>();
  for (const e of entries) {
    if (e.tl) {
      const n = normalizeFreqWord(e.tl);
      if (n) set.add(n);
      for (const t of contentTokens(e.tl)) set.add(t);
    }
    for (const h of e.freq_heads ?? []) {
      const n = normalizeFreqWord(h);
      if (n) set.add(n);
    }
  }
  return set;
}
