import { createHash } from 'node:crypto';

/** Stable JSON stringify (sorted keys). */
export function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = sortKeys(obj[key]);
  }
  return out;
}

export function inputHash(payload: unknown): string {
  return createHash('sha256').update(stableJson(payload)).digest('hex');
}

export type KnownIdTl = { id: string; type: string; tl: string };

export function itemIdTypeTl(item: {
  id?: string;
  type?: string;
  tl?: string;
}): KnownIdTl | null {
  if (!item?.id || !item.type || typeof item.tl !== 'string') return null;
  return { id: item.id, type: item.type, tl: item.tl };
}
