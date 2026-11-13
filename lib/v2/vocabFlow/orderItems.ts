/** Story-first item ordering for vocab_flow (words before the phrases that use them). */

export type VocabOrderItem = {
  id: string;
  type?: string;
  tl?: string;
};

function normTl(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[…!.?,;:«»"'`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripLeadingArticle(tl: string): string {
  return tl.replace(/^(o|a|os|as|um|uma)\s+/i, '').trim();
}

/** Word ids whose tl appears as a token/substring inside the phrase tl. */
export function wordsUsedByPhrase(
  phraseTl: string,
  words: VocabOrderItem[],
): string[] {
  const hay = ` ${normTl(phraseTl)} `;
  const hits: { id: string; len: number }[] = [];
  for (const w of words) {
    const raw = normTl(w.tl ?? '');
    const bare = normTl(stripLeadingArticle(w.tl ?? ''));
    for (const needle of [...new Set([raw, bare])]) {
      if (needle.length < 2) continue;
      if (hay.includes(` ${needle} `) || hay.includes(` ${needle}`)) {
        hits.push({ id: w.id, len: needle.length });
        break;
      }
    }
  }
  // Longer matches first so "café com leite" prefers full tokens stably
  hits.sort((a, b) => b.len - a.len);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of hits) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    out.push(h.id);
  }
  return out;
}

/**
 * Order today's word + phrase ids by first story appearance.
 * When a phrase is about to be emitted, any of its used words that are in
 * `candidateIds` and not yet emitted are inserted immediately before it.
 * Leftover candidates (not in the story) follow in the given candidate order.
 */
export function orderVocabFlowIds(opts: {
  candidateIds: string[];
  items: VocabOrderItem[];
  /** First story line index per item id (lower = earlier). */
  itemFirstIndex?: { id: string; line: number }[];
}): string[] {
  const byId = new Map(opts.items.map((i) => [i.id, i]));
  const candidates = [...new Set(opts.candidateIds)].filter((id) =>
    byId.has(id),
  );
  const candSet = new Set(candidates);
  const words = candidates
    .map((id) => byId.get(id)!)
    .filter((i) => i.type === 'word');

  const firstLine = new Map(
    (opts.itemFirstIndex ?? []).map((e) => [e.id, e.line]),
  );

  const storyOrdered = [...candidates].sort((a, b) => {
    const la = firstLine.has(a) ? firstLine.get(a)! : 9999;
    const lb = firstLine.has(b) ? firstLine.get(b)! : 9999;
    if (la !== lb) return la - lb;
    return candidates.indexOf(a) - candidates.indexOf(b);
  });

  const out: string[] = [];
  const placed = new Set<string>();

  const place = (id: string) => {
    if (placed.has(id) || !candSet.has(id)) return;
    placed.add(id);
    out.push(id);
  };

  for (const id of storyOrdered) {
    if (placed.has(id)) continue;
    const item = byId.get(id);
    if (item?.type === 'phrase' && item.tl) {
      for (const wid of wordsUsedByPhrase(item.tl, words)) {
        place(wid);
      }
    }
    place(id);
  }

  for (const id of candidates) place(id);

  return out;
}
