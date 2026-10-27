import type { Item } from '@/lib/v2/content/items';
import type { Page } from '@/lib/v2/content/page';
import type { Rt } from '@/lib/v2/content/rt';
import type { FormView } from './forms';
import { parseTarget } from './target';

export function plainRt(rt: Rt | readonly { text: string }[] | undefined): string {
  if (!rt) return '';
  return rt.map((seg) => seg.text).join('');
}

export function itemTargetText(item: Item | undefined): string | null {
  if (!item) return null;
  if (item.type === 'pattern') {
    return item.slots
      .map((slot) => ('tl' in slot ? slot.tl : slot.name_eg))
      .join(' ');
  }
  return item.tl;
}

export function itemMeaning(item: Item | undefined): string | null {
  if (!item || item.type === 'form' || item.type === 'pattern') return null;
  return item.ar;
}

export function refSpeech(
  ref: string,
  items: ReadonlyMap<string, Item>,
  forms: Readonly<Record<string, FormView>>,
): string | null {
  if (ref.startsWith('verb.')) return forms[ref]?.tl ?? null;
  return itemTargetText(items.get(ref));
}

type Cell = { ref: string } | Rt;

function cellSpeech(
  cell: Cell | undefined,
  items: ReadonlyMap<string, Item>,
  forms: Readonly<Record<string, FormView>>,
): string | null {
  if (!cell) return null;
  if (Array.isArray(cell)) {
    const tl = cell.filter((seg) => seg.lang === 'tl').map((seg) => seg.text).join('');
    return tl || plainRt(cell) || null;
  }
  if (typeof cell === 'object' && 'ref' in cell && typeof cell.ref === 'string') {
    return refSpeech(cell.ref, items, forms);
  }
  return null;
}

/** Portuguese line to speak after a guided reveal, when the target points at an item. */
export function targetSpeech(
  page: Page,
  target: string,
  items: ReadonlyMap<string, Item>,
  forms: Readonly<Record<string, FormView>>,
): string | null {
  const parsed = parseTarget(target);
  if (!parsed) return null;
  const block = page.blocks.find((b) => b.id === parsed.blockId);
  if (!block) return null;

  switch (parsed.kind) {
    case 'entry': {
      if (block.type !== 'compare') return null;
      const ref = block.columns[parsed.col]?.entries[parsed.i]?.ref;
      return ref ? refSpeech(ref, items, forms) : null;
    }
    case 'item': {
      if (block.type === 'cards') {
        return refSpeech(block.items[parsed.index] ?? '', items, forms);
      }
      if (block.type === 'examples') {
        const ref = block.items[parsed.index]?.ref;
        return ref ? refSpeech(ref, items, forms) : null;
      }
      if (block.type === 'vs_pairs') {
        const pair = block.pairs[parsed.index];
        if (!pair) return null;
        const left = refSpeech(pair.left, items, forms);
        const right = refSpeech(pair.right, items, forms);
        return [left, right].filter(Boolean).join('. ') || null;
      }
      if (block.type === 'scene') {
        const ref = block.hotspots[parsed.index]?.ref;
        return ref ? refSpeech(ref, items, forms) : null;
      }
      return null;
    }
    case 'cell': {
      if (block.type !== 'table') return null;
      return cellSpeech(block.cells[parsed.r]?.[parsed.c], items, forms);
    }
    case 'row': {
      if (block.type !== 'table') return null;
      const bits: string[] = [];
      for (const cell of block.cells[parsed.index] ?? []) {
        const text = cellSpeech(cell, items, forms);
        if (text) bits.push(text);
      }
      return bits.join('. ') || null;
    }
    case 'col':
    case 'block':
      return null;
    default:
      return null;
  }
}
