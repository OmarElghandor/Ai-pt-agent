/**
 * Fill `{name}` in opening lines. If unknown, drop the slot and a following comma.
 */
export function fillNameSlot(
  template: string,
  name: string | null | undefined,
): string {
  if (name?.trim()) {
    return template.replace(/\{name\}/g, name.trim());
  }
  return template
    .replace(/\s*\{name\}\s*,?/g, '')
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
