export function isExcludedIrFuturoCell(cell: {
  verb?: string;
  tense?: string;
  cell_id?: string;
}): boolean {
  if (!cell) return false;
  const verb = cell.verb || String(cell.cell_id || '').split('.')[0];
  const tense = cell.tense || String(cell.cell_id || '').split('.')[1];
  return verb === 'ir' && tense === 'futuro_proximo';
}

export function filterIntroducedCells<T extends { verb?: string; tense?: string; cell_id?: string }>(
  cells: T[] = [],
): T[] {
  return cells.filter((c) => !isExcludedIrFuturoCell(c));
}
