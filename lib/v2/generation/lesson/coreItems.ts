import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadPlan } from './plan';

export type CoreItemKind = 'word' | 'phrase' | 'pattern' | 'verb';

/** Hard cap per day (00 §1 — split lessons larger than this). */
export const MAX_CORE_ITEMS_PER_DAY = 14;

/** Hand-authored image scene description on a core item or day story. */
export type AuthoredImage = {
  ratio: '1:1' | '4:3' | '16:9';
  characters: string[];
  /** Scene description only — code adds STYLE + ref line + must_avoid. */
  prompt: string;
  /** Human-approved reference; keep when iterating style. */
  approved?: boolean;
};

export type CoreItem = {
  id: string;
  kind: CoreItemKind;
  tl: string;
  eg: string;
  /** Phrase: learner says vs hears. Copied onto phrase items. */
  role?: 'said' | 'heard';
  /** Said phrase that answers this heard line (id). */
  replies_to?: string;
  /**
   * Noun plural TL. Copied onto word items (core wins over the model).
   * `null` = no plural examples for that noun.
   */
  plural_tl?: string | null;
  /** Pattern: explicit word ids for holes (code uses these when present). */
  fills?: string[];
  /** Pattern template kind — code builds slots/examples. */
  pattern_kind?:
    | 'article_def'
    | 'article_indef'
    | 'plural_def'
    | 'polite_request'
    | 'chamo_me';
  /**
   * Alternatives of each other (e.g. time-of-day greetings).
   * Story needs ≥1 member; the rest must appear on the phrases page.
   */
  variant_group?: string;
  /** Alternate TL forms (never slash-joined in tl). */
  variant_tl?: string[];
  /** Feminine TL when the phrase changes with speaker gender. */
  tl_f?: string;
  /** Egyptian context tip copied onto phrase items (not the MSA ar). */
  context_eg?: string;
  /** Hand-authored image prompt (scene description). */
  image?: AuthoredImage;
  /** @deprecated Prefer variant_tl — accepted on load then normalized. */
  variants?: string[];
};

/** Authored real-world phrase — used verbatim; job is skipped (00 §4). */
export type AuthoredRealWorldPhrase = {
  tl: string;
  tl_f?: string;
  ar: string;
  eg_note: string;
  tag: string;
};

export type CoreItemsDay = {
  day: number;
  title_tl?: string;
  is_story: boolean;
  /** Phase test day (A1 on day 49) — no new items. */
  is_test?: boolean;
  core_items: CoreItem[];
  recycle_ids: string[];
  note?: string;
  /** Hand-authored story scene image prompt. */
  story_image?: AuthoredImage;
  /**
   * Authored «بيقولوها كده» phrases — when present, the real_world job
   * is skipped and these are used verbatim (still checked/enriched by code).
   */
  real_world?: AuthoredRealWorldPhrase[];
};

export type CoreItemsFile = {
  version: number;
  lang: string;
  note?: string;
  days: CoreItemsDay[];
};

export type CoreItemsValidationIssue = {
  path: string;
  rule: string;
  message: string;
};

const DEFAULT_CORE_PATH = path.join(
  process.cwd(),
  'content/v2/plan/pt-PT.core-items.json',
);

const ARTICLE_PREFIX_RE = /^(o|a|os|as|um|uma|uns|umas)\s+/i;

function normTl(tl: string): string {
  return tl.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Structural + curriculum checks for the core-items plan file. */
export function validateCoreItemsFile(
  file: CoreItemsFile,
): CoreItemsValidationIssue[] {
  const issues: CoreItemsValidationIssue[] = [];
  if (!file?.days?.length) {
    issues.push({
      path: 'days',
      rule: 'empty_file',
      message: 'core-items file has no days',
    });
    return issues;
  }

  const idOwner = new Map<string, number>();
  const tlOwner = new Map<string, { day: number; id: string }>();

  for (const day of file.days) {
    const n = day.core_items?.length ?? 0;
    if (n > MAX_CORE_ITEMS_PER_DAY) {
      issues.push({
        path: `days[${day.day}].core_items`,
        rule: 'core_items_cap',
        message: `day ${day.day} has ${n} core_items (max ${MAX_CORE_ITEMS_PER_DAY})`,
      });
    }
    for (const [i, item] of (day.core_items ?? []).entries()) {
      const path = `days[${day.day}].core_items[${i}]`;
      if (!item?.id) {
        issues.push({ path, rule: 'missing_id', message: 'item missing id' });
        continue;
      }
      const prev = idOwner.get(item.id);
      if (prev != null) {
        issues.push({
          path,
          rule: 'duplicate_id',
          message: `id ${item.id} already on day ${prev}`,
        });
      } else {
        idOwner.set(item.id, day.day);
      }

      if (item.tl) {
        const key = normTl(item.tl);
        const other = tlOwner.get(key);
        if (other && other.id !== item.id) {
          issues.push({
            path,
            rule: 'duplicate_tl',
            message: `tl "${item.tl}" duplicates ${other.id} (day ${other.day})`,
          });
        } else if (!other) {
          tlOwner.set(key, { day: day.day, id: item.id });
        }
      }

      if (item.kind === 'word' && item.tl && ARTICLE_PREFIX_RE.test(item.tl)) {
        const hasPluralKey = Object.prototype.hasOwnProperty.call(
          item,
          'plural_tl',
        );
        if (!hasPluralKey) {
          issues.push({
            path: `${path}.plural_tl`,
            rule: 'plural_tl_required',
            message: `${item.id} has an article but no plural_tl (string or null)`,
          });
        } else if (
          item.plural_tl != null &&
          typeof item.plural_tl !== 'string'
        ) {
          issues.push({
            path: `${path}.plural_tl`,
            rule: 'plural_tl_type',
            message: `${item.id} plural_tl must be string or null`,
          });
        }
      }
    }
  }
  return issues;
}

/** Normalize legacy `variants` → `variant_tl` on each core item. */
function normalizeCoreItem(item: CoreItem): CoreItem {
  const legacy = (item as CoreItem & { variants?: string[] }).variants;
  const variant_tl = [
    ...new Set([...(item.variant_tl ?? []), ...(legacy ?? [])]),
  ];
  const next: CoreItem = { ...item };
  if (variant_tl.length) next.variant_tl = variant_tl;
  delete (next as { variants?: string[] }).variants;
  return next;
}

function normalizeCoreItemsFile(file: CoreItemsFile): CoreItemsFile {
  return {
    ...file,
    days: file.days.map((d) => ({
      ...d,
      core_items: (d.core_items ?? []).map(normalizeCoreItem),
    })),
  };
}

let cached: CoreItemsFile | null = null;

export function loadCoreItemsFile(
  filePath = DEFAULT_CORE_PATH,
): CoreItemsFile {
  if (cached && filePath === DEFAULT_CORE_PATH) return cached;
  const raw = normalizeCoreItemsFile(
    JSON.parse(readFileSync(filePath, 'utf8')) as CoreItemsFile,
  );
  if (!raw?.days?.length) {
    throw new Error(`Empty core-items at ${filePath}`);
  }
  const issues = validateCoreItemsFile(raw);
  const fatals = issues.filter((i) =>
    ['empty_file', 'core_items_cap', 'duplicate_id'].includes(i.rule),
  );
  if (fatals.length) {
    throw new Error(
      `Invalid core-items at ${filePath}: ${fatals
        .map((i) => `${i.rule}: ${i.message}`)
        .join('; ')}`,
    );
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
    is_test: Boolean(entry.is_test),
    core_items: [...(entry.core_items ?? [])],
    recycle_ids: [...(entry.recycle_ids ?? [])],
    note: entry.note,
    story_image: entry.story_image,
    ...(entry.real_world?.length
      ? { real_world: [...entry.real_world] }
      : {}),
  };
}

/**
 * First core-items row for an id across the curriculum (any day).
 * Used to stub recycle ids missing from the registry.
 */
export function findCoreItemById(
  id: string,
  filePath?: string,
): CoreItem | null {
  const file = loadCoreItemsFile(filePath);
  for (const day of file.days) {
    const hit = day.core_items?.find((c) => c.id === id);
    if (hit) return { ...hit };
  }
  return null;
}

function asAuthoredImage(value: unknown): AuthoredImage | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<AuthoredImage>;
  if (
    (v.ratio !== '1:1' && v.ratio !== '4:3' && v.ratio !== '16:9') ||
    typeof v.prompt !== 'string' ||
    !v.prompt.trim() ||
    !Array.isArray(v.characters)
  ) {
    return null;
  }
  return {
    ratio: v.ratio,
    characters: v.characters.map(String),
    prompt: v.prompt.trim(),
    ...(v.approved === true ? { approved: true } : {}),
  };
}

/** Authored image on a core item for this day (by item id). */
export function getAuthoredItemImage(
  day: number,
  itemId: string,
  filePath?: string,
): AuthoredImage | null {
  const entry = getCoreItemsDay(day, filePath);
  const item = entry.core_items.find((c) => c.id === itemId);
  return asAuthoredImage(item?.image);
}

/** Authored story scene image for this day. */
export function getAuthoredStoryImage(
  day: number,
  filePath?: string,
): AuthoredImage | null {
  const entry = getCoreItemsDay(day, filePath);
  return asAuthoredImage(entry.story_image);
}

/** Story days, phase tests, and empty-core days introduce no new items. */
export function isNoNewItemsDay(entry: CoreItemsDay): boolean {
  return (
    entry.is_story ||
    Boolean(entry.is_test) ||
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

/**
 * Core items for one curriculum week (uses `week` from pt-PT.days.json,
 * not fixed 7-day arithmetic — weeks 4/5 have 8 days, week 7 has 5).
 */
export function coreItemsForWeek(
  week: number,
  filePath?: string,
): CoreItem[] {
  const plan = loadPlan();
  const dayNums = new Set(
    plan.days.filter((d) => d.week === week).map((d) => d.day),
  );
  const file = loadCoreItemsFile(filePath);
  const byId = new Map<string, CoreItem>();
  for (const d of file.days) {
    if (!dayNums.has(d.day)) continue;
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
