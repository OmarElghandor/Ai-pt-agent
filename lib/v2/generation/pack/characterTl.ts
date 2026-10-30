import type { Item } from '@/lib/v2/content/items';
import { FUNCTION_WORDS } from '@/lib/v2/generation/lists';

/** Safe short praise — never Ok. */
export const SAFE_PRAISE = ['Certo.', 'Muito bem.', 'Perfeito.'] as const;

const BANNED = new Set(['ok', 'ok.', 'okay', 'okay.']);

function functionWordSet(): Set<string> {
  return new Set(
    FUNCTION_WORDS.split(',')
      .map((w) => w.replace(/\s*\(.*\)\s*/g, '').trim().toLowerCase())
      .filter(Boolean),
  );
}

function tokenizeTl(tl: string): string[] {
  return tl
    .replace(/[…]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[,.;:!?«»"']+|[,.;:!?«»"']+$/g, ''))
    .filter(Boolean);
}

function bankTokens(items: Item[]): Set<string> {
  const out = new Set<string>();
  for (const item of items) {
    if (!('tl' in item) || typeof item.tl !== 'string') continue;
    for (const tok of tokenizeTl(item.tl)) {
      out.add(tok.toLowerCase());
    }
  }
  return out;
}

/**
 * Character line must be from the bank or function words only.
 * "Ok." is never allowed.
 */
export function isAllowedCharacterTl(
  tl: string | undefined,
  bank: Item[],
): boolean {
  if (!tl?.trim()) return false;
  const normalized = tl.trim().toLowerCase();
  if (BANNED.has(normalized) || normalized.startsWith('ok')) return false;
  const praise = SAFE_PRAISE.some(
    (p) => p.toLowerCase() === normalized || p.toLowerCase().replace(/\.$/, '') === normalized.replace(/\.$/, ''),
  );
  if (praise) return true;
  const allowed = new Set([...bankTokens(bank), ...functionWordSet()]);
  for (const tok of tokenizeTl(tl)) {
    if (!allowed.has(tok.toLowerCase())) return false;
  }
  return true;
}

export function pickCharacterTl(
  preferred: string | undefined,
  bank: Item[],
  fallbackIndex = 0,
): string {
  if (preferred && isAllowedCharacterTl(preferred, bank)) return preferred.trim();
  return SAFE_PRAISE[fallbackIndex % SAFE_PRAISE.length]!;
}
