import { readFileSync } from 'node:fs';
import path from 'node:path';

export type CoreItemKind = 'word' | 'phrase' | 'pattern' | 'verb';

export type CoreItem = {
  id: string;
  kind: CoreItemKind;
  tl: string;
  eg: string;
  /** Phrase: learner says vs hears. Copied onto phrase items. */
  role?: 'said' | 'heard';
  /** Said phrase that answers this heard line (id). */
  replies_to?: string;
  /** Pattern: explicit word ids for holes (code uses these when present). */
  fills?: string[];
  /** Pattern template kind — code builds slots/examples. */
  pattern_kind?:
    | 'article_def'
    | 'article_indef'
    | 'plural_def'
    | 'polite_request';
};

export type CoreItemsDay = {
  day: number;
  title_tl?: string;
  is_story: boolean;
  core_items: CoreItem[];
  recycle_ids: string[];
  note?: string;
};

export type CoreItemsFile = {
  version: number;
  lang: string;
  note?: string;
  days: CoreItemsDay[];
};

const DEFAULT_CORE_PATH = path.join(
  process.cwd(),
  'content/v2/plan/pt-PT.core-items.json',
);

let cached: CoreItemsFile | null = null;

export function loadCoreItemsFile(
  filePath = DEFAULT_CORE_PATH,
): CoreItemsFile {
  if (cached && filePath === DEFAULT_CORE_PATH) return cached;
  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as CoreItemsFile;
  if (!raw?.days?.length) {
    throw new Error(`Empty core-items at ${filePath}`);
  }
  if (filePath === DEFAULT_CORE_PATH) cached = raw;
  return raw;
}

/** Test helper — clear module cache between tests if needed. */
export function resetCoreItemsCache(): void {
  cached = null;
}

export function getCoreItemsDay(
  day: number,
  filePath?: string,
): CoreItemsDay {
  const file = loadCoreItemsFile(filePath);
  const entry = file.days.find((d) => d.day === day);
  if (!entry) {
    throw new Error(`Day ${day} not found in core-items`);
  }
  return {
    day: entry.day,
    title_tl: entry.title_tl,
    is_story: Boolean(entry.is_story),
    core_items: [...(entry.core_items ?? [])],
    recycle_ids: [...(entry.recycle_ids ?? [])],
    note: entry.note,
  };
}

/** Story days and day 30 (or any day with empty core) introduce no new items. */
export function isNoNewItemsDay(entry: CoreItemsDay): boolean {
  return (
    entry.is_story ||
    entry.day === 30 ||
    (entry.core_items?.length ?? 0) === 0
  );
}

export function nonVerbCoreIds(core: CoreItem[]): string[] {
  return core.filter((c) => c.kind !== 'verb').map((c) => c.id);
}

export function verbCoreItems(core: CoreItem[]): CoreItem[] {
  return core.filter((c) => c.kind === 'verb');
}

/** All core items for days 1..throughDay (inclusive) — recycle works without prior lessons. */
export function coreItemsThroughDay(
  throughDay: number,
  filePath?: string,
): CoreItem[] {
  const file = loadCoreItemsFile(filePath);
  const byId = new Map<string, CoreItem>();
  for (const d of file.days) {
    if (d.day > throughDay) continue;
    for (const c of d.core_items ?? []) {
      if (!byId.has(c.id)) byId.set(c.id, c);
    }
  }
  return [...byId.values()];
}

export function coreTlById(
  throughDay: number,
  filePath?: string,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of coreItemsThroughDay(throughDay, filePath)) {
    if (c.tl) map.set(c.id, c.tl);
  }
  return map;
}

export function coreItemAsKnownStub(c: CoreItem): {
  id: string;
  type: string;
  tl: string;
} {
  const type =
    c.kind === 'verb'
      ? 'form'
      : c.kind === 'pattern'
        ? 'pattern'
        : c.kind === 'word'
          ? 'word'
          : 'phrase';
  return { id: c.id, type, tl: c.tl };
}
