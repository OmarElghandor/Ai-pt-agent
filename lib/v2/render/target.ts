export type TargetParts =
  | { kind: 'block'; blockId: string }
  | { kind: 'col'; blockId: string; index: number }
  | { kind: 'row'; blockId: string; index: number }
  | { kind: 'cell'; blockId: string; r: number; c: number }
  | { kind: 'entry'; blockId: string; col: number; i: number }
  | { kind: 'item'; blockId: string; index: number };

/** `b2`, `b2/col:0`, `b2/row:3`, `b2/cell:3:1`, `b2/entry:0:2`, `b4/item:2`. */
export function parseTarget(target: string): TargetParts | null {
  const base = /^([a-zA-Z0-9_]+)$/.exec(target);
  if (base) return { kind: 'block', blockId: base[1]! };

  const col = /^([a-zA-Z0-9_]+)\/col:(\d+)$/.exec(target);
  if (col) return { kind: 'col', blockId: col[1]!, index: Number(col[2]) };

  const row = /^([a-zA-Z0-9_]+)\/row:(\d+)$/.exec(target);
  if (row) return { kind: 'row', blockId: row[1]!, index: Number(row[2]) };

  const cell = /^([a-zA-Z0-9_]+)\/cell:(\d+):(\d+)$/.exec(target);
  if (cell) {
    return {
      kind: 'cell',
      blockId: cell[1]!,
      r: Number(cell[2]),
      c: Number(cell[3]),
    };
  }

  const entry = /^([a-zA-Z0-9_]+)\/entry:(\d+):(\d+)$/.exec(target);
  if (entry) {
    return {
      kind: 'entry',
      blockId: entry[1]!,
      col: Number(entry[2]),
      i: Number(entry[3]),
    };
  }

  const item = /^([a-zA-Z0-9_]+)\/item:(\d+)$/.exec(target);
  if (item) return { kind: 'item', blockId: item[1]!, index: Number(item[2]) };

  return null;
}

export function targetKey(blockId: string, part: string | null): string {
  return part ? `${blockId}/${part}` : blockId;
}
