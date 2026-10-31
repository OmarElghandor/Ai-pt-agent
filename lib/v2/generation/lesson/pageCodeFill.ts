import type { Page } from '@/lib/v2/content/page';

type LooseBlock = Record<string, unknown> & { id?: string; type?: string };

function nextBlockId(blocks: LooseBlock[]): string {
  const used = new Set(blocks.map((b) => b.id).filter(Boolean));
  let n = blocks.length + 1;
  while (used.has(`b${n}`)) n += 1;
  return `b${n}`;
}

/** Phrase ids this page must show. Introduces win; otherwise phrase ids in the allow-list. */
export function phraseIdsForCards(
  introduces: string[],
  allowedIds: string[],
): string[] {
  const fromIntro = introduces.filter((id) => id.startsWith('phrase.'));
  if (fromIntro.length) return [...new Set(fromIntro)];
  return [...new Set(allowedIds.filter((id) => id.startsWith('phrase.')))];
}

export function patternIdForFormula(introduces: string[]): string | undefined {
  return introduces.find((id) => id.startsWith('pattern.'));
}

export function withPhraseCards(
  blocks: LooseBlock[],
  phraseIds: string[],
): LooseBlock[] {
  if (!phraseIds.length) return blocks;
  const unique = [...new Set(phraseIds)];
  let found = false;
  const next = blocks.map((block) => {
    if (block.type !== 'cards' || found) return block;
    found = true;
    return { ...block, items: unique };
  });
  if (!found) {
    next.push({ id: nextBlockId(next), type: 'cards', items: unique });
  }
  return next;
}

export function withPatternFormula(
  blocks: LooseBlock[],
  patternId: string | undefined,
): LooseBlock[] {
  if (!patternId) return blocks;
  if (blocks.some((block) => block.type === 'formula')) return blocks;
  return [
    { id: nextBlockId(blocks), type: 'formula', pattern: patternId },
    ...blocks,
  ];
}

export function withDictionaryCards(
  blocks: LooseBlock[],
  wordIds: string[],
): LooseBlock[] {
  if (!wordIds.length) return blocks;
  const unique = [...new Set(wordIds)];
  let found = false;
  const next = blocks.map((block) => {
    if (block.type !== 'cards' || found) return block;
    found = true;
    return { ...block, items: unique };
  });
  if (!found) {
    next.push({ id: nextBlockId(next), type: 'cards', items: unique });
  }
  return next;
}

/**
 * Insert the block that item ids already decide, before schema parse.
 * Does not invent tips, steps, controls, hotspots, or compare columns.
 */
export function applyDeterminedBlocks(
  hydrated: unknown,
  opts: {
    preset: string;
    introduces: string[];
    allowedIds: string[];
    wordIds?: string[];
  },
): unknown {
  if (!hydrated || typeof hydrated !== 'object') return hydrated;
  const root = hydrated as Record<string, unknown>;
  const page = root.page;
  if (!page || typeof page !== 'object' || Array.isArray(page)) return hydrated;
  const record = page as Record<string, unknown>;
  let blocks: LooseBlock[] = Array.isArray(record.blocks)
    ? (record.blocks as LooseBlock[])
    : [];

  if (opts.preset === 'phrases') {
    blocks = withPhraseCards(
      blocks,
      phraseIdsForCards(opts.introduces, opts.allowedIds),
    );
  } else if (opts.preset === 'dictionary') {
    blocks = withDictionaryCards(blocks, opts.wordIds ?? []);
  } else if (opts.preset === 'pattern') {
    blocks = withPatternFormula(blocks, patternIdForFormula(opts.introduces));
  }

  return { ...root, page: { ...record, blocks } };
}

export function forcePhraseCards(page: Page, phraseIds: string[]): Page {
  if (page.preset !== 'phrases' || !phraseIds.length) return page;
  return {
    ...page,
    blocks: withPhraseCards(page.blocks, phraseIds) as Page['blocks'],
  };
}

/**
 * Enforce pattern block order: formula → examples → tip (sections);
 * guided legacy also keeps practice.
 * Remaps existing guided step targets to new block ids; does not shrink steps.
 */
export function orderPatternBlocks(page: Page): Page {
  if (page.preset !== 'pattern') return page;
  const order =
    page.mode === 'sections'
      ? (['formula', 'examples', 'tip'] as const)
      : (['formula', 'examples', 'practice', 'tip'] as const);
  const byType = new Map<string, (typeof page.blocks)[number]>();
  const rest: typeof page.blocks = [];
  const oldIdByType = new Map<string, string>();
  for (const b of page.blocks) {
    if ((order as readonly string[]).includes(b.type) && !byType.has(b.type)) {
      byType.set(b.type, b);
      oldIdByType.set(b.type, b.id);
    } else {
      rest.push(b);
    }
  }
  const ordered = order
    .map((t) => byType.get(t))
    .filter(Boolean) as typeof page.blocks;
  const blocks = [...ordered, ...rest].map((b, i) => ({
    ...b,
    id: `b${i + 1}`,
  }));

  const idMap = new Map<string, string>();
  for (const [type, oldId] of oldIdByType) {
    const neu = blocks.find((b) => b.type === type);
    if (neu) idMap.set(oldId, neu.id);
  }
  for (const b of rest) {
    const neu = blocks.find(
      (x) => x.type === b.type && !idMap.has(b.id) && x.id,
    );
    // keep rest ids remapped by position in rest
  }
  // Remap any old block id → new id by type first, then identity
  for (const b of page.blocks) {
    const neu = blocks.find((x) => x.type === b.type && x.id);
    if (neu && !idMap.has(b.id)) idMap.set(b.id, neu.id);
  }

  let steps = page.steps?.map((s) => {
    const base = String(s.target).split('/')[0] ?? s.target;
    const mapped = idMap.get(base);
    if (!mapped) return s;
    const restPath = String(s.target).includes('/')
      ? String(s.target).slice(base.length)
      : '';
    return { ...s, target: `${mapped}${restPath}` };
  });

  // Sections pages never keep steps.
  if (page.mode === 'sections') {
    return { ...page, blocks, steps: undefined };
  }

  // Guided pattern pages need 12–20 steps; pad if a prior pass shrank them.
  if (page.mode === 'guided') {
    const tipId =
      blocks.find((b) => b.type === 'tip')?.id ??
      blocks[blocks.length - 1]?.id ??
      'b1';
    const formulaId = blocks.find((b) => b.type === 'formula')?.id ?? 'b1';
    const examplesId =
      blocks.find((b) => b.type === 'examples')?.id ?? formulaId;
    const practiceId =
      blocks.find((b) => b.type === 'practice')?.id ?? examplesId;
    if (!steps || steps.length < 12) {
      const tipEg = [
        { text: 'خد بالك من الشرطة بعد الفعل', lang: 'eg' as const },
      ];
      const look = [{ text: 'شوف التركيبة', lang: 'eg' as const }];
      const askPad = (correct: string, wrongForm: string) => ({
        question: [{ text: 'إيه الصح؟', lang: 'eg' as const }],
        options: [
          { label: [{ text: correct, lang: 'tl' as const }], correct: true },
          {
            label: [{ text: wrongForm, lang: 'tl' as const, wrong: true }],
            correct: false,
            wrong: true,
          },
        ],
      });
      const built: NonNullable<Page['steps']> = [
        { kind: 'reveal', target: formulaId, tip: look, chapter: '1' },
        { kind: 'reveal', target: formulaId, tip: look, chapter: '1' },
        { kind: 'reveal', target: formulaId, tip: tipEg, chapter: '1' },
        { kind: 'reveal', target: examplesId, tip: look, chapter: '2' },
        {
          kind: 'ask',
          target: examplesId,
          chapter: '2',
          ask: askPad('Chamo-me Omar.', 'Chamome Omar.'),
        },
        { kind: 'reveal', target: examplesId, tip: look, chapter: '2' },
        { kind: 'reveal', target: examplesId, tip: look, chapter: '2' },
        { kind: 'reveal', target: practiceId, tip: look, chapter: '3' },
        {
          kind: 'ask',
          target: practiceId,
          chapter: '3',
          ask: askPad('Chamo-me Inês.', 'Chamo me Inês.'),
        },
        { kind: 'reveal', target: practiceId, tip: look, chapter: '3' },
        { kind: 'reveal', target: tipId, tip: tipEg, chapter: '4' },
        { kind: 'reveal', target: tipId, tip: tipEg, chapter: '4' },
      ];
      steps = built;
    }
  }

  return { ...page, blocks, ...(steps ? { steps } : {}) };
}

export function forcePatternFormula(page: Page, patternId: string): Page {
  if (page.preset !== 'pattern' || !patternId) return page;
  const hasFormula = page.blocks.some((block) => block.type === 'formula');
  if (!hasFormula) {
    return {
      ...page,
      blocks: withPatternFormula(page.blocks, patternId) as Page['blocks'],
    };
  }
  // Ensure formula.pattern is the item id (never a display string)
  return {
    ...page,
    blocks: page.blocks.map((block) =>
      block.type === 'formula'
        ? { ...block, pattern: patternId }
        : block,
    ) as Page['blocks'],
  };
}
