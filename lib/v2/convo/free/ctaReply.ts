/** Whole-message Learn CTA yes/no (G4). */

const YES = new Set([
  'نعم',
  'أيوه',
  'ايوه',
  'آه',
  'اه',
  'تمام',
  'يلا',
  'ماشي',
  'sim',
  'yes',
  'ok',
]);

const NO = new Set(['لا', 'لأ', 'no', 'não', 'nao']);

/**
 * Strip punctuation/emoji/diacritics; keep letters/digits/spaces.
 * Matching is against the entire remaining string only.
 */
export function normalizeCtaReply(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export type CtaReplyKind = 'yes' | 'no' | null;

export function classifyCtaReply(text: string): CtaReplyKind {
  const norm = normalizeCtaReply(text);
  if (!norm) return null;
  if (YES.has(norm)) return 'yes';
  if (NO.has(norm)) return 'no';
  return null;
}
