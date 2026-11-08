const BLOCKED_NAMES = new Set(['admin', 'test', 'user', 'dev']);

/**
 * Reject placeholder / account-looking names for `{name}` (G5).
 * Returns null when the name should be dropped.
 */
export function sanitizeLearnerName(
  name: string | null | undefined,
): string | null {
  const trimmed = name?.trim() ?? '';
  if (!trimmed) return null;
  if (BLOCKED_NAMES.has(trimmed.toLowerCase())) return null;
  if (trimmed.includes('@')) return null;
  if (/\d/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Fill `{name}` in opening lines. If unknown, drop the slot and a following comma.
 */
export function fillNameSlot(
  template: string,
  name: string | null | undefined,
): string {
  const safe = sanitizeLearnerName(name);
  if (safe) {
    return template.replace(/\{name\}/g, safe);
  }
  return template
    .replace(/,?\s*\{name\}\s*,?/g, '')
    .replace(/  +/g, ' ')
    .replace(/\s+([!?.,])/g, '$1')
    .trim();
}

/** Build the single opening character bubble: opening + share + ask. */
export function composeOpeningBubbleTl(opts: {
  opening_tl: string;
  share_tl: string;
  ask_tl: string;
  name?: string | null;
}): string {
  const opening = fillNameSlot(opts.opening_tl, opts.name);
  return `${opening} ${opts.share_tl} ${opts.ask_tl}`
    .replace(/\s+/g, ' ')
    .trim();
}

export function composeOpeningBubbleAr(opts: {
  opening_ar: string;
  share_ar: string;
  ask_ar: string;
  name?: string | null;
}): string {
  const opening = fillNameSlot(opts.opening_ar, opts.name);
  return `${opening} ${opts.share_ar} ${opts.ask_ar}`
    .replace(/\s+/g, ' ')
    .trim();
}
