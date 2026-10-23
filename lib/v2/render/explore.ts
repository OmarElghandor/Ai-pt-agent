import type { Block } from '@/lib/v2/content/blocks';
import { parseFormId } from '@/lib/v2/content/conjugations/formId';
import type { Control, Page } from '@/lib/v2/content/page';

export function axisChoiceCount(block: Block, axis: 'rows' | 'cols'): number {
  if (block.type === 'table') {
    return axis === 'rows' ? block.rows.length : block.cols.length;
  }
  if (block.type === 'compare') {
    if (axis === 'cols') return block.columns.length;
    return block.columns.reduce((max, col) => Math.max(max, col.entries.length), 0);
  }
  return 0;
}

export function revealControlComplete(
  seen: readonly number[],
  choiceCount: number,
): boolean {
  if (choiceCount <= 0) return false;
  const unique = new Set(seen);
  for (let i = 0; i < choiceCount; i++) {
    if (!unique.has(i)) return false;
  }
  return true;
}

export function completedControlIds(
  page: Page,
  seenByControl: Readonly<Record<string, readonly number[]>>,
): Set<string> {
  const done = new Set<string>();
  for (const control of page.controls ?? []) {
    const seen = seenByControl[control.id] ?? [];
    if (control.type === 'reveal_axis') {
      const block = page.blocks.find((b) => b.id === control.target);
      const count = block
        ? axisChoiceCount(block, control.axis)
        : control.tips.length;
      if (revealControlComplete(seen, count)) done.add(control.id);
    } else if (control.type === 'swap') {
      if (revealControlComplete(seen, control.options.length)) done.add(control.id);
    }
  }
  return done;
}

/** Blocks still held by a locked_until rule whose control is not complete. */
export function lockedBlockIds(
  page: Page,
  completed: ReadonlySet<string>,
): Set<string> {
  const locked = new Set<string>();
  for (const rule of page.locked_until ?? []) {
    if (completed.has(rule.control)) continue;
    for (const id of rule.blocks) locked.add(id);
  }
  return locked;
}

/** Keep tense and person; substitute the lemma. */
export function swapFormId(formId: string, lemma: string): string | null {
  const parsed = parseFormId(formId);
  if (!parsed) return null;
  return `verb.${lemma}:${parsed.tense}:${parsed.person}`;
}

function blockVerbRefs(block: Block): string[] {
  const ids: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === 'string') {
      if (value.startsWith('verb.')) ids.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry);
      return;
    }
    if (value && typeof value === 'object') {
      for (const entry of Object.values(value)) walk(entry);
    }
  };
  walk(block);
  return ids;
}

/** Form ids a swap control can display, so the client never reads the seed. */
export function swapAlternateIds(page: Page): string[] {
  const ids: string[] = [];
  for (const control of page.controls ?? []) {
    if (control.type !== 'swap') continue;
    const blockId = control.target.split('/')[0] ?? '';
    const block = page.blocks.find((b) => b.id === blockId);
    if (!block) continue;
    for (const lemma of control.options) {
      for (const ref of blockVerbRefs(block)) {
        const next = swapFormId(ref, lemma);
        if (next) ids.push(next);
      }
    }
  }
  return ids;
}

/**
 * If a swap control targets this block (or this column), return the substituted form id.
 * Otherwise return `ref`.
 */
export function applySwap(
  ref: string,
  blockId: string,
  colIndex: number | null,
  controls: readonly Control[] | undefined,
  selectedLemmaByControl: Readonly<Record<string, string>>,
): string {
  if (!ref.startsWith('verb.')) return ref;
  for (const control of controls ?? []) {
    if (control.type !== 'swap') continue;
    const lemma = selectedLemmaByControl[control.id];
    if (!lemma) continue;
    const slash = control.target.indexOf('/');
    const targetBlock = slash === -1 ? control.target : control.target.slice(0, slash);
    const rest = slash === -1 ? '' : control.target.slice(slash + 1);
    if (targetBlock !== blockId) continue;
    if (rest.startsWith('col:')) {
      const col = Number(rest.slice(4));
      if (colIndex !== col) continue;
    }
    const next = swapFormId(ref, lemma);
    if (next) return next;
  }
  return ref;
}
