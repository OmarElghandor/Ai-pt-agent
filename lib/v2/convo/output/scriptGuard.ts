/**
 * Shared PT/AR script guards for all model outputs (learn-fix-2 M2).
 */

/** CJK Unified Ideographs + Hangul + Hiragana/Katakana. */
const CJK_RE =
  /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/u;

/** Cyrillic. */
const CYRILLIC_RE = /[\u0400-\u04FF]/u;

/** Arabic script (incl. presentation forms). */
const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u;

/**
 * Letters that are neither Latin nor Arabic (excludes marks/emoji/digits/punct).
 * Catches Greek, Hebrew, Thai, Devanagari, etc.
 */
const OTHER_LETTER_RE =
  /(?![A-Za-z\u00C0-\u024F\u1E00-\u1EFF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF])\p{L}/u;

export type ScriptIssue =
  | 'cjk'
  | 'cyrillic'
  | 'forbidden_script'
  | 'pt_not_latin'
  | 'ar_not_arabic';

/**
 * Split PT and AR on "AR:" wherever it appears (same line or new line).
 */
export function splitReactionAr(text: string): {
  reaction: string;
  ar: string | null;
} {
  const normalized = text.replace(/\r\n/g, '\n');
  // Prefer newline form, else first AR: anywhere.
  const line = normalized.match(/^([\s\S]*?)\n\s*AR\s*:\s*([\s\S]*)$/im);
  if (line) {
    return {
      reaction: (line[1] ?? '').replace(/^\s*\[[^\]]*\]\s*/, '').trim(),
      ar: (line[2] ?? '').trim(),
    };
  }
  const anywhere = normalized.match(/^([\s\S]*?)\s*AR\s*:\s*([\s\S]+)$/i);
  if (anywhere) {
    return {
      reaction: (anywhere[1] ?? '').replace(/^\s*\[[^\]]*\]\s*/, '').trim(),
      ar: (anywhere[2] ?? '').trim(),
    };
  }
  return {
    reaction: normalized.replace(/^\s*\[[^\]]*\]\s*/, '').trim(),
    ar: null,
  };
}

export function findForbiddenScript(text: string): ScriptIssue | null {
  if (!text) return null;
  if (CJK_RE.test(text)) return 'cjk';
  if (CYRILLIC_RE.test(text)) return 'cyrillic';
  if (OTHER_LETTER_RE.test(text)) return 'forbidden_script';
  return null;
}

/** PT body: Latin letters (+ accents) + emoji/punct; no Arabic/CJK/Cyrillic. */
export function checkPtScript(text: string): ScriptIssue | null {
  const forbidden = findForbiddenScript(text);
  if (forbidden) return forbidden;
  if (ARABIC_RE.test(text)) return 'pt_not_latin';
  return null;
}

/** AR body must contain Arabic and no Latin letters / CJK / Cyrillic. */
export function checkArScript(text: string): ScriptIssue | null {
  if (!text.trim()) return 'ar_not_arabic';
  if (!ARABIC_RE.test(text)) return 'ar_not_arabic';
  if (CJK_RE.test(text)) return 'cjk';
  if (CYRILLIC_RE.test(text)) return 'cyrillic';
  // Latin letters in AR line (except allowed digits/punct) → reject
  if (/[A-Za-z]/.test(text)) return 'ar_not_arabic';
  if (OTHER_LETTER_RE.test(text.replace(ARABIC_RE, ''))) {
    return 'forbidden_script';
  }
  return null;
}

export function scriptIssueReason(issue: ScriptIssue): string {
  switch (issue) {
    case 'cjk':
      return 'remove Chinese/Japanese/Korean characters; use Portuguese and Arabic only';
    case 'cyrillic':
      return 'remove Cyrillic characters; use Portuguese and Arabic only';
    case 'forbidden_script':
      return 'use only Latin (Portuguese) and Arabic scripts';
    case 'pt_not_latin':
      return 'the Portuguese line must be Latin script only';
    case 'ar_not_arabic':
      return 'the AR: line must be Arabic script only';
  }
}
