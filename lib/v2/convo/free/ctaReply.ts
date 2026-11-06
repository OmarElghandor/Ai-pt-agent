import { normalizeAr } from '@/lib/v2/convo/sideChannel/normalizeAr';

/** Whole-message Learn CTA yes/no (G4). */

const YES = new Set([
  'نعم',
  'ايوه',
  'اه',
  'تمام',
  'يلا',
  'ماشي',
  'sim',
  'yes',
  'ok',
]);

/** After normalizeAr, «لأ» folds to «لا». */
const NO = new Set(['لا', 'no', 'nao']);

/**
 * Strip punctuation/emoji; fold Arabic variants; keep letters/digits/spaces.
 * Matching is against the entire remaining string only.
 */
export function normalizeCtaReply(text: string): string {
  const folded = normalizeAr(text);
  return folded
    .normalize('NFKD')
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
