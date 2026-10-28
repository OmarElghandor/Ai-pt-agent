import { parseFormId } from '@/lib/v2/content/conjugations/formId';
import { verbClass, type VerbClass } from '@/lib/v2/content/conjugations/regular';
import type { Rt, RtGroup } from '@/lib/v2/content/rt';

export const GROUP_HEADER: Record<RtGroup, string> = {
  a: 'bg-v2-group-a text-white',
  b: 'bg-v2-group-b text-white',
  c: 'bg-v2-group-c text-white',
  m: 'bg-v2-group-m text-white',
  f: 'bg-v2-group-f text-white',
  verb: 'bg-v2-group-verb text-white',
  prep: 'bg-v2-group-prep text-white',
  pron: 'bg-v2-group-pron text-white',
  neg: 'bg-v2-group-neg text-white',
  neutral: 'bg-v2-primary text-white',
};

/** Solid header fills for -ar / -er / -ir conjugation columns. */
export const VERB_CLASS_HEADER: Record<VerbClass, string> = {
  ar: 'bg-v2-verb-ar text-white',
  er: 'bg-v2-verb-er text-white',
  ir: 'bg-v2-verb-ir text-white',
};

/** Label is a class marker: -AR, AR, -er-, etc. */
const CLASS_MARKER_RE = /^-?(ar|er|ir)-?$/i;

/** Detect verb class from a column label like "-AR" / "AR". */
export function verbClassFromLabel(label: Rt): VerbClass | null {
  const text = label
    .map((seg) => seg.text)
    .join('')
    .trim();
  const m = CLASS_MARKER_RE.exec(text);
  if (!m) return null;
  return m[1]!.toLowerCase() as VerbClass;
}

/** Detect verb class from the first verb form ref in a column of cells. */
export function verbClassFromColRefs(
  cells: ({ ref: string } | Rt)[][],
  colIndex: number,
): VerbClass | null {
  for (const row of cells) {
    const cell = row[colIndex];
    if (!cell || Array.isArray(cell)) continue;
    const parsed = parseFormId(cell.ref);
    if (!parsed) continue;
    const cls = verbClass(parsed.lemma);
    if (cls) return cls;
  }
  return null;
}

/**
 * Prefer explicit -AR/-ER/-IR labels; on conjugation (split_endings) tables,
 * fall back to the column's first verb lemma. Otherwise use group colors.
 */
export function tableColHeaderClass(
  label: Rt,
  group: RtGroup | undefined,
  cells: ({ ref: string } | Rt)[][],
  colIndex: number,
  splitEndings = false,
): string {
  const fromLabel = verbClassFromLabel(label);
  if (fromLabel) return VERB_CLASS_HEADER[fromLabel];
  if (splitEndings) {
    const fromCells = verbClassFromColRefs(cells, colIndex);
    if (fromCells) return VERB_CLASS_HEADER[fromCells];
  }
  return GROUP_HEADER[group ?? 'neutral'];
}
