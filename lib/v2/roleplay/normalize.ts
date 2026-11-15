/** Normalize Portuguese learner text for matching. */

export function normalizeRoleplayText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function roleplayWords(s: string): string[] {
  return normalizeRoleplayText(s).split(/\s+/).filter(Boolean);
}

/** True when needle appears as a whole token or contiguous phrase in haystack. */
export function normalizedContains(
  haystack: string,
  needle: string,
): boolean {
  const h = normalizeRoleplayText(haystack);
  const n = normalizeRoleplayText(needle);
  if (!h || !n) return false;
  if (n.includes(' ')) return h.includes(n);
  const tokens = new Set(h.split(/\s+/).filter(Boolean));
  return tokens.has(n) || h.includes(n);
}
