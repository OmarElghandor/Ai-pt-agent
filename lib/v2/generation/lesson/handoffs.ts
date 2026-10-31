import type { Item } from '@/lib/v2/content/items';
import type { Page } from '@/lib/v2/content/page';
import type { Question, Micro } from '@/lib/v2/content/lesson';
import type { KnownIdTl } from './hash';
import type { OutlinePagePlan, OutlineResult } from './stages/types';

export type ItemRole = 'core' | 'extra' | 'recycle' | 'chunk' | 'known' | 'new';

export type ItemDigestEntry = {
  id: string;
  type: string;
  tl: string;
  role: ItemRole;
  /** Admin badge: core | extra | recycle (derived). */
  badge?: 'core' | 'extra' | 'recycle';
};

export type PlanSummaryEntry = {
  index: number;
  title: string;
  introduces: string[];
};

export type OutlineHandoff = {
  pages: OutlinePagePlan[];
  plan_summary: PlanSummaryEntry[];
};

export type PageDigest = {
  index: number;
  taught_eg: string;
  example_ids: string[];
  tip_heads: string[];
  asks: string[];
};

export type QuestionDigestEntry = {
  id: string;
  page_index: number;
  skill: string;
  tests: string[];
};

export type MicroHandoff = {
  series: string;
  step: number;
  examples_used: string[];
};

export type DayDigest = {
  introduced_ids: string[];
  rule: string;
  micro_step: string | null;
  story_beats: string[];
  new_items: { id: string; type: string; tl: string }[];
};

export type NeighborPageStub = {
  title: string;
  purpose: string;
  handoff: string;
};

export function handoffKey(
  kind: string,
  pageIndex?: number | null,
): string {
  if (
    pageIndex != null &&
    (kind === 'page' || kind === 'critic' || kind === 'questions')
  ) {
    return `${kind}:${pageIndex}`;
  }
  return kind;
}

function normalizeTl(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleOf(entry: OutlinePagePlan): string {
  if (typeof entry.title === 'string') return entry.title;
  if (Array.isArray(entry.title)) {
    return (entry.title as unknown[])
      .map((seg) =>
        seg && typeof seg === 'object' && 'text' in seg
          ? String((seg as { text: unknown }).text)
          : '',
      )
      .join('')
      .trim();
  }
  return String(entry.title ?? '');
}

/**
 * Select known items whose tl matches today's core/chunk words, plus recycle ids.
 * Never returns the whole registry.
 */
export function selectKnownForDay(opts: {
  pool: KnownIdTl[];
  coreWords: string[];
  earlyChunks: string[];
  recycleIds: string[];
}): KnownIdTl[] {
  const recycle = new Set(opts.recycleIds);
  const targets = new Set(
    [...opts.coreWords, ...opts.earlyChunks]
      .map(normalizeTl)
      .filter(Boolean),
  );
  const out: KnownIdTl[] = [];
  const seen = new Set<string>();
  for (const row of opts.pool) {
    if (seen.has(row.id)) continue;
    if (recycle.has(row.id)) {
      seen.add(row.id);
      out.push(row);
      continue;
    }
    const tl = normalizeTl(row.tl);
    if (!tl) continue;
    for (const t of targets) {
      if (tl === t || tl.includes(t) || t.includes(tl)) {
        seen.add(row.id);
        out.push(row);
        break;
      }
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export function buildItemDigest(opts: {
  items: Item[];
  earlyChunks: string[];
  recycleIds: string[];
  knownIds: Set<string>;
  /** Core item ids for today (from core-items file). */
  coreIds?: Set<string>;
  /** Fill empty tl from core file (days ≤ today). */
  coreTlById?: Map<string, string>;
}): ItemDigestEntry[] {
  const chunks = new Set(opts.earlyChunks.map(normalizeTl));
  const recycle = new Set(opts.recycleIds);
  const core = opts.coreIds ?? new Set<string>();
  const byId = new Map(opts.items.map((it) => [it.id, it]));
  return opts.items.map((item) => {
    let tl = 'tl' in item && typeof item.tl === 'string' ? item.tl : '';
    if (item.type === 'pattern' && !tl) {
      const literals = item.slots
        .filter((s): s is { tl: string } => 'tl' in s && typeof s.tl === 'string')
        .map((s) => s.tl);
      const firstEx = item.examples?.[0];
      const exItem = firstEx ? byId.get(firstEx) : undefined;
      const exTl =
        exItem && 'tl' in exItem && typeof exItem.tl === 'string'
          ? exItem.tl
          : '';
      tl = literals.length ? literals.join(' … ') : exTl;
    }
    if (!tl && opts.coreTlById?.has(item.id)) {
      tl = opts.coreTlById.get(item.id)!;
    }
    const isExtra = Boolean(
      (item as { extra?: boolean }).extra,
    );
    let role: ItemRole = 'new';
    let badge: ItemDigestEntry['badge'];
    if (recycle.has(item.id)) {
      role = 'recycle';
      badge = 'recycle';
    } else if (core.has(item.id)) {
      role = 'core';
      badge = 'core';
    } else if (isExtra) {
      role = 'extra';
      badge = 'extra';
    } else if (opts.knownIds.has(item.id)) {
      role = 'known';
    } else if (tl && chunks.has(normalizeTl(tl))) {
      role = 'chunk';
    }
    return {
      id: item.id,
      type: item.type,
      tl,
      role,
      badge,
    };
  });
}

export function buildOutlineHandoff(outline: OutlineResult): OutlineHandoff {
  return {
    pages: outline.pages,
    plan_summary: outline.pages.map((p) => ({
      index: p.index,
      title: titleOf(p),
      introduces: [...(p.introduces ?? [])],
    })),
  };
}

/** Slim story handoff for outline / page jobs (no audio blobs). */
export type StoryHandoff = {
  story_id: string;
  setting: string;
  cast: { id: string; name: string; role: string }[];
  lines: {
    index: number;
    speaker: string;
    tl: string;
    ids: string[];
    ar?: string;
  }[];
  /** First outline-relevant appearance order of item ids in the story. */
  item_first_index: { id: string; line: number }[];
};

export function buildStoryHandoff(story: {
  id: string;
  setting: string;
  cast: { id: string; name: string; role: string }[];
  lines: { speaker: string; tl: string; ids?: string[]; ar?: string }[];
}): StoryHandoff {
  const seen = new Set<string>();
  const item_first_index: { id: string; line: number }[] = [];
  const lines = story.lines.map((line, index) => {
    for (const id of line.ids ?? []) {
      if (!seen.has(id)) {
        seen.add(id);
        item_first_index.push({ id, line: index });
      }
    }
    return {
      index,
      speaker: line.speaker,
      tl: line.tl,
      ids: [...(line.ids ?? [])],
      ar: line.ar,
    };
  });
  return {
    story_id: story.id,
    setting: story.setting,
    cast: story.cast.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
    })),
    lines,
    item_first_index,
  };
}

export function neighborStubs(
  pages: OutlinePagePlan[],
  index: number,
): { prev: NeighborPageStub | null; next: NeighborPageStub | null } {
  const toStub = (p: OutlinePagePlan): NeighborPageStub => ({
    title: titleOf(p),
    purpose: p.purpose,
    handoff: p.handoff ?? '',
  });
  const prev = pages.find((p) => p.index === index - 1);
  const next = pages.find((p) => p.index === index + 1);
  return {
    prev: prev ? toStub(prev) : null,
    next: next ? toStub(next) : null,
  };
}

function firstWords(text: string, n: number): string {
  return text.trim().split(/\s+/).slice(0, n).join(' ');
}

export function buildPageDigest(opts: {
  index: number;
  page: Page;
  taught_eg: string;
}): PageDigest {
  const tip_heads: string[] = [];
  const asks: string[] = [];
  const example_ids: string[] = [];

  const rtToText = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      return value
        .map((s) =>
          s && typeof s === 'object' && 'text' in s
            ? String((s as { text: unknown }).text)
            : '',
        )
        .join(' ');
    }
    return '';
  };

  for (const b of opts.page.blocks ?? []) {
    if ('items' in b && Array.isArray((b as { items?: string[] }).items)) {
      for (const id of (b as { items: string[] }).items) example_ids.push(id);
    }
    if ('examples' in b && Array.isArray((b as { examples?: unknown[] }).examples)) {
      for (const ex of (b as { examples: unknown[] }).examples) {
        if (ex && typeof ex === 'object' && 'id' in ex) {
          example_ids.push(String((ex as { id: unknown }).id));
        } else if (typeof ex === 'string') {
          example_ids.push(ex);
        }
      }
    }
    if ((b as { type?: string }).type === 'tip') {
      const tipBlock = b as { title?: unknown; body?: unknown };
      const text =
        rtToText(tipBlock.body) || rtToText(tipBlock.title);
      if (text) tip_heads.push(firstWords(text, 8));
    }
  }

  for (const step of opts.page.steps ?? []) {
    const kind =
      'kind' in step
        ? String((step as { kind: string }).kind)
        : 'type' in step
          ? String((step as { type: string }).type)
          : '';
    if (kind === 'reveal' && 'tip' in step) {
      const text = rtToText((step as { tip: unknown }).tip);
      if (text) tip_heads.push(firstWords(text, 8));
    }
    if (kind === 'ask' && 'ask' in step) {
      const ask = (step as { ask?: { question?: unknown; prompt?: unknown } }).ask;
      const text = rtToText(ask?.question ?? ask?.prompt);
      if (text) asks.push(firstWords(text, 12));
    }
  }

  return {
    index: opts.index,
    taught_eg: opts.taught_eg,
    example_ids: [...new Set(example_ids)],
    tip_heads,
    asks,
  };
}

export function buildQuestionDigest(
  questions: Question[],
): QuestionDigestEntry[] {
  return questions.map((q) => ({
    id: q.id,
    page_index: q.page_index ?? 0,
    skill: q.skill,
    tests: [...(q.tests ?? [])],
  }));
}

export function buildMicroHandoff(opts: {
  series: string;
  step: number;
  micro: Micro;
}): MicroHandoff {
  return {
    series: opts.series,
    step: opts.step,
    examples_used: [...(opts.micro.tool?.examples ?? [])],
  };
}

export function buildDayDigest(opts: {
  items: Item[];
  rule: string;
  micro_step: string | null;
  story_beats: string[];
  introduced_ids?: string[];
}): DayDigest {
  const new_items = opts.items.map((i) => ({
    id: i.id,
    type: i.type,
    tl: 'tl' in i && typeof i.tl === 'string' ? i.tl : '',
  }));
  return {
    introduced_ids:
      opts.introduced_ids ?? new_items.map((i) => i.id),
    rule: opts.rule,
    micro_step: opts.micro_step,
    story_beats: opts.story_beats,
    new_items,
  };
}

export function phraseDigest(items: Item[]): { id: string; tl: string }[] {
  return items
    .filter((i) => i.type === 'phrase' || i.type === 'sentence')
    .map((i) => ({
      id: i.id,
      tl: 'tl' in i && typeof i.tl === 'string' ? i.tl : '',
    }));
}

export function newAndRecycleDigest(opts: {
  items: Item[];
  recycleIds: string[];
}): { id: string; tl: string; role: 'new' | 'recycle' }[] {
  const recycle = new Set(opts.recycleIds);
  return opts.items.map((i) => ({
    id: i.id,
    tl: 'tl' in i && typeof i.tl === 'string' ? i.tl : '',
    role: recycle.has(i.id) ? ('recycle' as const) : ('new' as const),
  }));
}

/** Jobs that consume a given handoff key (for admin UI). */
export function consumersOf(
  key: string,
  jobs: { kind: string; page_index?: number | null; depends_on?: string[] }[],
  producerId: string,
): string[] {
  return jobs
    .filter((j) => (j.depends_on ?? []).includes(producerId))
    .map((j) =>
      j.page_index != null && (j.kind === 'page' || j.kind === 'critic')
        ? `${j.kind}:${j.page_index}`
        : j.kind,
    );
}
