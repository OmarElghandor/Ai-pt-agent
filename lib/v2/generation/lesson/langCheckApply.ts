import type { Item } from '@/lib/v2/content/items';
import type { Page } from '@/lib/v2/content/page';
import { transliteratePtToSay } from '@/lib/v2/content/translit';
import { checkDialoguePage } from './dialogueChecks';
import type { LangCheckPatch } from './jobs/runLangCheck';

export type LangCheckDiscard = {
  path: string;
  rule: 'lang_check_stale' | 'lang_check_rejected' | 'lang_check_bad_path';
  message: string;
  patch: LangCheckPatch;
};

export type LangCheckApplyResult = {
  pages: Page[];
  items: Item[];
  applied: LangCheckPatch[];
  discarded: LangCheckDiscard[];
  /** Patched weekly reading.tl when path was story.reading.tl. */
  readingTl?: string;
};

const PAGE_TL_RE =
  /^pages\[(\d+)\]\.blocks\[(\d+)\]\.lines\[(\d+)\](?:\.tl)?$/i;
const ITEM_TL_RE = /^items\[([^\]]+)\](?:\.tl)?$/i;
const ITEM_PLURAL_RE = /^items\[([^\]]+)\]\.plural_tl$/i;
const STORY_READING_RE = /^story\.reading\.tl$/i;

function normalizeTl(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function pageLineTl(pages: Page[], pi: number, bi: number, li: number): string | null {
  const page = pages[pi];
  if (!page) return null;
  const block = page.blocks[bi];
  if (!block || block.type !== 'dialogue') return null;
  const line = block.lines[li];
  if (!line) return null;
  return typeof line.tl === 'string' ? line.tl : '';
}

function setPageLine(
  pages: Page[],
  pi: number,
  bi: number,
  li: number,
  next: { tl: string; ar?: string },
): Page[] {
  return pages.map((page, i) => {
    if (i !== pi) return page;
    return {
      ...page,
      blocks: page.blocks.map((block, j) => {
        if (j !== bi || block.type !== 'dialogue') return block;
        return {
          ...block,
          lines: block.lines.map((line, k) => {
            if (k !== li) return line;
            return {
              ...line,
              tl: next.tl,
              ...(next.ar != null ? { ar: next.ar } : {}),
            };
          }),
        };
      }),
    };
  });
}

function setItemTl(
  items: Item[],
  id: string,
  next: { tl: string; ar?: string },
): Item[] {
  return items.map((it) => {
    if (it.id !== id) return it;
    const say = transliteratePtToSay(next.tl);
    const base = { ...it, tl: next.tl, say } as Item;
    if (next.ar != null && 'ar' in base) {
      return { ...base, ar: next.ar } as Item;
    }
    return base;
  });
}

function lineHighs(
  page: Page,
  items: Item[],
  bi: number,
  li: number,
): string[] {
  const issues = checkDialoguePage({
    page,
    items,
    maxWords: 12,
    day: 1,
  });
  const prefix = `blocks[${bi}].lines[${li}]`;
  return issues
    .filter(
      (iss) =>
        iss.severity === 'high' &&
        (iss.path?.includes(prefix) ||
          iss.path === `${prefix}.tl` ||
          iss.path === `${prefix}.ids`),
    )
    .map((iss) => `${iss.path ?? ''}:${iss.message}`);
}

function dialogueNodeOk(
  before: Page,
  after: Page,
  items: Item[],
  bi: number,
  li: number,
): boolean {
  const prev = new Set(lineHighs(before, items, bi, li));
  const next = lineHighs(after, items, bi, li);
  return next.every((h) => prev.has(h));
}

function itemNodeOk(items: Item[], id: string): boolean {
  const it = items.find((i) => i.id === id);
  if (!it || !('tl' in it) || typeof it.tl !== 'string') return false;
  if (!it.tl.trim()) return false;
  if ('say' in it && typeof (it as { say?: string }).say === 'string') {
    const say = (it as { say: string }).say;
    if (!say.trim()) return false;
  }
  return true;
}

/**
 * Apply ≤5 lang_check patches. Never regenerates — discard on mismatch or check fail.
 */
export function applyLangCheckPatches(
  pages: Page[],
  items: Item[],
  patches: LangCheckPatch[],
  opts?: { max?: number; readingTl?: string },
): LangCheckApplyResult {
  const max = opts?.max ?? 5;
  const capped = patches.slice(0, max);
  let nextPages = pages.map((p) => ({ ...p, blocks: [...p.blocks] }));
  let nextItems = [...items];
  let readingTl = opts?.readingTl;
  const applied: LangCheckPatch[] = [];
  const discarded: LangCheckDiscard[] = [];

  for (const patch of capped) {
    const path = patch.path.trim();
    if (STORY_READING_RE.test(path)) {
      const current = readingTl ?? '';
      if (!current) {
        discarded.push({
          path,
          rule: 'lang_check_bad_path',
          message: 'no story.reading.tl on this day',
          patch,
        });
        continue;
      }
      if (normalizeTl(current) !== normalizeTl(patch.wrong_tl)) {
        discarded.push({
          path,
          rule: 'lang_check_stale',
          message: `wrong_tl does not match current reading.tl`,
          patch,
        });
        continue;
      }
      readingTl = patch.fixed_tl;
      applied.push(patch);
      continue;
    }
    const pageMatch = path.match(PAGE_TL_RE);
    const itemMatch = path.match(ITEM_TL_RE);

    if (pageMatch) {
      const pi = Number(pageMatch[1]);
      const bi = Number(pageMatch[2]);
      const li = Number(pageMatch[3]);
      const current = pageLineTl(nextPages, pi, bi, li);
      if (current == null) {
        discarded.push({
          path,
          rule: 'lang_check_bad_path',
          message: `unresolvable path ${path}`,
          patch,
        });
        continue;
      }
      if (normalizeTl(current) !== normalizeTl(patch.wrong_tl)) {
        discarded.push({
          path,
          rule: 'lang_check_stale',
          message: `wrong_tl does not match current tl`,
          patch,
        });
        continue;
      }
      const beforePage = nextPages[pi]!;
      const candidate = setPageLine(nextPages, pi, bi, li, {
        tl: patch.fixed_tl,
        ar: patch.fixed_ar,
      });
      if (!dialogueNodeOk(beforePage, candidate[pi]!, nextItems, bi, li)) {
        discarded.push({
          path,
          rule: 'lang_check_rejected',
          message: `dialogue checks failed after patch`,
          patch,
        });
        continue;
      }
      nextPages = candidate;
      applied.push(patch);
      continue;
    }

    if (itemMatch) {
      const id = itemMatch[1]!;
      const it = nextItems.find((i) => i.id === id);
      if (!it || !('tl' in it) || typeof it.tl !== 'string') {
        discarded.push({
          path,
          rule: 'lang_check_bad_path',
          message: `unknown item ${id}`,
          patch,
        });
        continue;
      }
      if (normalizeTl(it.tl) !== normalizeTl(patch.wrong_tl)) {
        discarded.push({
          path,
          rule: 'lang_check_stale',
          message: `wrong_tl does not match current tl`,
          patch,
        });
        continue;
      }
      const candidate = setItemTl(nextItems, id, {
        tl: patch.fixed_tl,
        ar: patch.fixed_ar,
      });
      if (!itemNodeOk(candidate, id)) {
        discarded.push({
          path,
          rule: 'lang_check_rejected',
          message: `item checks failed after patch`,
          patch,
        });
        continue;
      }
      nextItems = candidate;
      applied.push(patch);
      continue;
    }

    const pluralMatch = path.match(ITEM_PLURAL_RE);
    if (pluralMatch) {
      const id = pluralMatch[1]!;
      const it = nextItems.find((i) => i.id === id && i.type === 'word');
      if (!it || it.type !== 'word') {
        discarded.push({
          path,
          rule: 'lang_check_bad_path',
          message: `unknown word ${id}`,
          patch,
        });
        continue;
      }
      const current =
        (typeof it.plural_tl === 'string' && it.plural_tl.trim()) ||
        (typeof it.plural === 'string' && it.plural.trim()) ||
        '(missing)';
      if (
        normalizeTl(current) !== normalizeTl(patch.wrong_tl) &&
        !(current === '(missing)' && patch.wrong_tl === '(missing)')
      ) {
        discarded.push({
          path,
          rule: 'lang_check_stale',
          message: `wrong_tl does not match current plural_tl`,
          patch,
        });
        continue;
      }
      const bare = patch.fixed_tl.replace(/^(o|a|os|as|um|uma)\s+/i, '').trim();
      if (!bare) {
        discarded.push({
          path,
          rule: 'lang_check_rejected',
          message: 'empty plural_tl after strip',
          patch,
        });
        continue;
      }
      nextItems = nextItems.map((i) =>
        i.id === id && i.type === 'word'
          ? ({ ...i, plural_tl: bare } as Item)
          : i,
      );
      applied.push(patch);
      continue;
    }

    discarded.push({
      path,
      rule: 'lang_check_bad_path',
      message: `unsupported path ${path}`,
      patch,
    });
  }

  return {
    pages: nextPages,
    items: nextItems,
    applied,
    discarded,
    ...(readingTl != null ? { readingTl } : {}),
  };
}
