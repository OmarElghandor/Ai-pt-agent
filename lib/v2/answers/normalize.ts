/** Lowercase, trim, collapse spaces, strip edge punctuation. */
export function normalizeAnswer(raw: string): string {
  return raw
    .normalize('NFC')
    .toLowerCase()
    .trim()
    .replace(/[?!.,;:…]+$/g, '')
    .replace(/^[¿¡]+/g, '')
    .replace(/\s+/g, ' ');
}

/** Strip combining accents for accent-only comparison. */
export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
}

export function normalizeForCompare(raw: string): string {
  return stripAccents(normalizeAnswer(raw));
}
