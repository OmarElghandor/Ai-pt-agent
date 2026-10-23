export type PartVisibility = 'dim' | 'active' | 'shown';

export type ChapterSpan = {
  id: string;
  label: string;
  start: number;
  end: number;
};

export type ChapterFill = ChapterSpan & {
  progress: number;
  active: boolean;
};

type StepLike = { target: string; chapter?: string };

/** Consecutive steps that share a chapter label. A missing label inherits the previous one. */
export function chapterSpans(steps: readonly { chapter?: string }[]): ChapterSpan[] {
  const spans: ChapterSpan[] = [];
  for (let i = 0; i < steps.length; i++) {
    const label = steps[i]!.chapter ?? spans.at(-1)?.label ?? 'الصفحة';
    const last = spans.at(-1);
    if (!last || last.label !== label) {
      spans.push({ id: `${label}:${i}`, label, start: i, end: i + 1 });
    } else {
      last.end = i + 1;
    }
  }
  return spans;
}

/** `cursor` is the current step index. Steps before it count as revealed. */
export function chapterFill(
  spans: readonly ChapterSpan[],
  cursor: number,
  done: boolean,
): ChapterFill[] {
  return spans.map((span) => {
    const total = span.end - span.start;
    const revealed = Math.max(0, Math.min(span.end, cursor) - span.start);
    const progress = total === 0 ? 0 : revealed / total;
    const active = !done && cursor >= span.start && cursor < span.end;
    return { ...span, progress, active };
  });
}

export function targetsBefore(steps: readonly StepLike[], index: number): string[] {
  return steps.slice(0, Math.max(0, index)).map((step) => step.target);
}

export function allTargets(steps: readonly StepLike[]): string[] {
  return steps.map((step) => step.target);
}

/**
 * Unrevealed parts stay faint. The active target is the only highlight.
 * Revealing a column or the whole block does not paint every row.
 * A revealed block id shows every part of that block.
 */
export function guidedPartVisibility(
  blockId: string,
  part: string | null,
  revealed: ReadonlySet<string>,
  active: string | null,
): PartVisibility {
  const key = part ? `${blockId}/${part}` : blockId;
  const blockRevealed = revealed.has(blockId);
  const blockActive = active === blockId;

  if (!part && (blockActive || active === key)) return 'active';
  if (blockRevealed || blockActive) return 'shown';
  if (active === key) return 'active';
  if (revealed.has(key)) return 'shown';

  // A revealed or active row shows its cells. A column reveal does not.
  if (part?.startsWith('cell:')) {
    const rowIndex = part.split(':')[1];
    const rowKey = `${blockId}/row:${rowIndex}`;
    if (active === rowKey) return 'active';
    if (revealed.has(rowKey)) return 'shown';
  }
  return 'dim';
}
