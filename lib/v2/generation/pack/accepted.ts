import type { Item } from '@/lib/v2/content/items';

const POLITE = ['por favor', 'se faz favor'];

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

/** Build accepted variants: base, polite tails, accentless. */
export function buildAcceptedVariants(
  expectedTl: string,
  extras: string[] = [],
): string[] {
  const base = expectedTl.trim();
  if (!base) return extras.filter(Boolean);
  const set = new Set<string>();
  const add = (s: string) => {
    const t = s.trim();
    if (t) set.add(t);
  };
  add(base);
  add(stripAccents(base));
  for (const p of POLITE) {
    add(`${base} ${p}`);
    add(`${p} ${base}`);
    add(stripAccents(`${base} ${p}`));
  }
  for (const e of extras) add(e);
  return [...set];
}

export function expectedTlFromIds(
  ids: string[],
  byId: Map<string, Item>,
): string {
  const parts: string[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (!item) continue;
    if ('tl' in item && typeof item.tl === 'string') parts.push(item.tl);
  }
  return parts.join(' ').trim();
}
