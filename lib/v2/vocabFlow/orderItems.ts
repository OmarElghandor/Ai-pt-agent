/** Vocab-flow content ordering: authored `flow` or computed `uses` (00 §4). */

export type VocabOrderItem = {
  id: string;
  type?: string;
  tl?: string;
  /** Authored uses override (core phrases / real-world). */
  uses?: string[];
  real_world?: boolean;
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
 * Shared content-word ids inside a phrase tl (words + short phrase chunks).
 * Used when authored `uses` is absent.
 */
export function contentUsesForPhrase(
  phraseTl: string,
  candidates: VocabOrderItem[],
  selfId: string,
): string[] {
  const others = candidates.filter(
    (c) => c.id !== selfId && Boolean(c.tl) && c.type !== 'pattern',
  );
  const words = others.filter((c) => c.type === 'word');
  const fromWords = wordsUsedByPhrase(phraseTl, words);
  if (fromWords.length) return fromWords;

  // Fallback: longer phrase/chunk tls that appear inside this sentence
  const hay = ` ${normTl(phraseTl)} `;
  const hits: { id: string; len: number }[] = [];
  for (const c of others) {
    if (c.type === 'word') continue;
    const raw = normTl(c.tl ?? '');
    if (raw.length < 3) continue;
    if (hay.includes(` ${raw} `) || hay.includes(` ${raw}`)) {
      hits.push({ id: c.id, len: raw.length });
    }
  }
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

/** Resolve uses for a sentence: authored override, else shared content words. */
export function resolveSentenceUses(
  item: VocabOrderItem,
  candidates: VocabOrderItem[],
  candSet: Set<string>,
): string[] {
  const authored = (item.uses ?? []).filter((id) => candSet.has(id));
  if ((item.uses?.length ?? 0) > 0) return authored;
  if (!item.tl) return [];
  return contentUsesForPhrase(item.tl, candidates, item.id).filter((id) =>
    candSet.has(id),
  );
}

function isPatternId(id: string): boolean {
  return id.startsWith('pattern.');
}

function storySortKey(
  id: string,
  candidates: string[],
  firstLine: Map<string, number>,
): { line: number; idx: number } {
  return {
    line: firstLine.has(id) ? firstLine.get(id)! : 9999,
    idx: candidates.indexOf(id),
  };
}

/**
 * Authored `flow`: resolve item ids + `rw:N` refs; skip patterns.
 * Indices in `rw:N` map to `rwIds` (real_world array order).
 */
export function resolveAuthoredFlow(opts: {
  flow: string[];
  rwIds?: string[];
  /** Optional allow-list; when set, unknown ids are skipped. */
  knownIds?: Set<string>;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const rwIds = opts.rwIds ?? [];

  for (const entry of opts.flow) {
    if (!entry || isPatternId(entry)) continue;
    let id: string | null = null;
    const m = /^rw:(\d+)$/.exec(entry);
    if (m) {
      const idx = Number(m[1]);
      id = Number.isInteger(idx) ? (rwIds[idx] ?? null) : null;
    } else {
      id = entry;
    }
    if (!id || seen.has(id)) continue;
    if (opts.knownIds && !opts.knownIds.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Without authored flow: place each sentence right after the last item it
 * uses; leftover atoms follow story order. Real-world phrases are never
 * parked as a group at the end.
 */
export function computeFlowOrder(opts: {
  candidateIds: string[];
  items: VocabOrderItem[];
  itemFirstIndex?: { id: string; line: number }[];
}): string[] {
  const byId = new Map(opts.items.map((i) => [i.id, i]));
  const candidates = [...new Set(opts.candidateIds)].filter(
    (id) => byId.has(id) && !isPatternId(id),
  );
  const candSet = new Set(candidates);
  const firstLine = new Map(
    (opts.itemFirstIndex ?? []).map((e) => [e.id, e.line]),
  );

  const sortByStory = (ids: string[]) =>
    [...ids].sort((a, b) => {
      const ka = storySortKey(a, candidates, firstLine);
      const kb = storySortKey(b, candidates, firstLine);
      if (ka.line !== kb.line) return ka.line - kb.line;
      return ka.idx - kb.idx;
    });

  type Sentence = { id: string; uses: string[]; realWorld: boolean };
  const sentences: Sentence[] = [];
  const atoms: string[] = [];

  for (const id of candidates) {
    const item = byId.get(id)!;
    const isSentence =
      Boolean(item.real_world) ||
      item.type === 'phrase' ||
      item.type === 'sentence';
    if (!isSentence) {
      atoms.push(id);
      continue;
    }
    const uses = resolveSentenceUses(item, opts.items, candSet).filter(
      (u) => u !== id,
    );
    if (uses.length === 0 && !item.real_world) {
      // Short chunk / atomic phrase — treat as an item, not a sentence.
      atoms.push(id);
    } else {
      sentences.push({
        id,
        uses,
        realWorld: Boolean(item.real_world),
      });
    }
  }

  const orderedAtoms = sortByStory(atoms);
  const out: string[] = [];
  const placed = new Set<string>();
  const pending = [...sentences];

  const place = (id: string, at?: number) => {
    if (placed.has(id) || !candSet.has(id)) return;
    if (at == null || at >= out.length) {
      out.push(id);
    } else {
      out.splice(at, 0, id);
    }
    placed.add(id);
  };

  const lastUseIndex = (uses: string[]): number => {
    let max = -1;
    for (const u of uses) {
      const i = out.indexOf(u);
      if (i > max) max = i;
    }
    return max;
  };

  const flushReady = () => {
    let progressed = true;
    while (progressed) {
      progressed = false;
      // Prefer sentences whose last use is closest to the end (just placed).
      const ready = pending
        .map((s, idx) => ({ s, idx, last: lastUseIndex(s.uses) }))
        .filter(
          (x) =>
            x.s.uses.length > 0 &&
            x.s.uses.every((u) => placed.has(u)) &&
            !placed.has(x.s.id),
        )
        .sort((a, b) => a.last - b.last || a.idx - b.idx);

      for (const { s, last } of ready) {
        const insertAt = last + 1;
        place(s.id, insertAt);
        const p = pending.findIndex((x) => x.id === s.id);
        if (p >= 0) pending.splice(p, 1);
        progressed = true;
      }
    }
  };

  for (const atom of orderedAtoms) {
    place(atom);
    flushReady();
  }

  // Remaining sentences (uses missing or cyclic): insert after whatever uses
  // exist; never dump all real-world as a trailing block.
  const rest = sortByStory(pending.map((s) => s.id));
  for (const id of rest) {
    if (placed.has(id)) continue;
    const s = pending.find((x) => x.id === id);
    if (!s) {
      place(id);
      continue;
    }
    const last = lastUseIndex(s.uses.filter((u) => placed.has(u)));
    if (last >= 0) {
      place(id, last + 1);
    } else {
      // No uses placed yet — weave by story among remaining, not at absolute end
      // if other non-RW atoms somehow remain (they shouldn't). Append mid if RW.
      place(id);
    }
    flushReady();
  }

  for (const id of candidates) place(id);
  return out;
}

/**
 * Order today's word + phrase (+ real-world) ids for vocab_flow.
 * Authored `flow` wins; otherwise compute from uses.
 */
export function orderFlowContent(opts: {
  flow?: string[];
  /** Real-world phrase ids in `real_world` / handoff order (`rw:N`). */
  rwIds?: string[];
  candidateIds: string[];
  items: VocabOrderItem[];
  itemFirstIndex?: { id: string; line: number }[];
}): string[] {
  const byId = new Map(opts.items.map((i) => [i.id, i]));
  const known = new Set([
    ...opts.candidateIds,
    ...(opts.rwIds ?? []),
    ...byId.keys(),
  ]);

  if (opts.flow?.length) {
    const resolved = resolveAuthoredFlow({
      flow: opts.flow,
      rwIds: opts.rwIds,
      knownIds: known,
    });
    // Append any candidate (non-pattern) missing from authored flow, story order
    const missing = opts.candidateIds.filter(
      (id) =>
        !resolved.includes(id) &&
        !isPatternId(id) &&
        byId.has(id) &&
        !(byId.get(id) as { real_world?: boolean } | undefined)?.real_world,
    );
    if (!missing.length) return resolved;
    const firstLine = new Map(
      (opts.itemFirstIndex ?? []).map((e) => [e.id, e.line]),
    );
    missing.sort((a, b) => {
      const ka = storySortKey(a, opts.candidateIds, firstLine);
      const kb = storySortKey(b, opts.candidateIds, firstLine);
      if (ka.line !== kb.line) return ka.line - kb.line;
      return ka.idx - kb.idx;
    });
    return [...resolved, ...missing.filter((id) => !resolved.includes(id))];
  }

  return computeFlowOrder({
    candidateIds: opts.candidateIds,
    items: opts.items,
    itemFirstIndex: opts.itemFirstIndex,
  });
}

/**
 * Order today's word + phrase ids by first story appearance.
 * When a phrase is about to be emitted, any of its used words that are in
 * `candidateIds` and not yet emitted are inserted immediately before it.
 * Leftover candidates (not in the story) follow in the given candidate order.
 *
 * @deprecated Prefer {@link orderFlowContent}. Kept for call sites / tests
 * that only need the word-before-phrase heuristic.
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
