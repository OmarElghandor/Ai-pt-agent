/**
 * Opener rule (§3): if the reaction starts with the same first word as the
 * previous character bubble («Claro», «Perfeito»…), remove that first word.
 */

function normalizeWord(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();
}

/** First up to `n` content words (emoji/punct stripped from tokens). */
export function firstWords(text: string, n = 1): string[] {
  const out: string[] = [];
  for (const raw of text.trim().split(/\s+/)) {
    const w = normalizeWord(raw);
    if (!w) continue;
    out.push(w);
    if (out.length >= n) break;
  }
  return out;
}

/**
 * If `reactionPt` starts with the same first word as `prevCharacterTl`,
 * strip that first word. Returns the trimmed reaction (may be empty).
 */
export function stripRepeatedOpener(
  prevCharacterTl: string | null | undefined,
  reactionPt: string,
): string {
  const reaction = reactionPt.trim();
  const prev = (prevCharacterTl ?? '').trim();
  if (!reaction || !prev) return reaction;

  const prevFirst = firstWords(prev, 1)[0];
  if (!prevFirst) return reaction;

  const reactionTokens = reaction.split(/\s+/).filter(Boolean);
  if (!reactionTokens.length) return reaction;
  if (normalizeWord(reactionTokens[0]!) !== prevFirst) return reaction;

  const rest = reactionTokens.slice(1).join(' ').trim();
  return rest.replace(/^[,.;:!?\u2026]+\s*/u, '').trim();
}
