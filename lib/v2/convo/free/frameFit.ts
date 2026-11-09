import type { ThreadFrame } from '@/lib/v2/convo/topics';

/** Common Arabic place / word cues → Latin tokens that appear in chips. */
const AR_TO_LATIN: Array<{ ar: RegExp; latin: string }> = [
  { ar: /أمادورا|امادورا/i, latin: 'Amadora' },
  { ar: /لشبونة|ليشبونة/i, latin: 'Lisboa' },
  { ar: /ألمادا|المادا/i, latin: 'Almada' },
  { ar: /أوديفيلاس|اوديفيلاس/i, latin: 'Odivelas' },
  { ar: /مراتي|زوجتي/i, latin: 'mulher' },
  { ar: /جوزي|زوجي/i, latin: 'marido' },
  { ar: /رز/i, latin: 'arroz' },
];

/**
 * If the Arabic answer fits the current frame, return the Portuguese to try
 * (a chip, or no model). Else null → coach call.
 */
export function fitFrameFromArabic(
  arabic: string,
  frame: ThreadFrame | undefined | null,
): string | null {
  if (!frame?.chips?.length) return null;
  const text = arabic.trim();
  if (!text) return null;

  for (const chip of frame.chips) {
    for (const { ar, latin } of AR_TO_LATIN) {
      if (ar.test(text) && new RegExp(latin, 'i').test(chip)) {
        return chip;
      }
    }
    // Latin loanword already in the Arabic message
    const tokens =
      chip.match(/[A-Za-zÀ-ÿ]{4,}/g)?.map((t) => t.toLowerCase()) ?? [];
    for (const t of tokens) {
      if (text.toLowerCase().includes(t)) return chip;
    }
  }
  return null;
}
