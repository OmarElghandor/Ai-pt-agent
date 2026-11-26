import {
  loadConjugationSeed,
  resolveForm,
  type ResolvedForm,
} from '@/lib/v2/content/conjugations/resolve';
import { verbClass } from '@/lib/v2/content/conjugations/regular';
import type { Person, Tense } from '@/lib/v2/content/items';

export type HighlightSpan = { start: number; end: number };

/**
 * Find the conjugated ending inside a Portuguese line and return its span.
 * Prefers the resolved form's ending; falls back to comparing with the stem.
 */
export function findEndingHighlight(
  tl: string,
  lemma: string,
  tense: Tense = 'pres',
  person: Person = 'eu',
): HighlightSpan | null {
  const form = resolveForm(`verb.${lemma}:${tense}:${person}`);
  if (!form) return null;
  return highlightFormInLine(tl, form);
}

export function highlightFormInLine(
  tl: string,
  form: ResolvedForm,
): HighlightSpan | null {
  const lower = tl.toLowerCase();
  const formTl = form.tl.toLowerCase();
  const idx = lower.indexOf(formTl);
  if (idx >= 0 && form.ending) {
    const endStart = idx + formTl.length - form.ending.length;
    if (endStart >= idx) {
      return { start: endStart, end: idx + formTl.length };
    }
  }
  // Fallback: last occurrence of the ending after the stem
  if (form.stem && form.ending) {
    const stemIdx = lower.indexOf(form.stem.toLowerCase());
    if (stemIdx >= 0) {
      const after = lower.slice(stemIdx + form.stem.length);
      if (after.startsWith(form.ending.toLowerCase())) {
        const start = stemIdx + form.stem.length;
        return { start, end: start + form.ending.length };
      }
    }
  }
  return null;
}

export function isRegularVerifiedLemma(lemma: string): boolean {
  const seed = loadConjugationSeed();
  const verb = seed.verbs.find((v) => v.lemma === lemma);
  if (!verb || !verb.verified) return false;
  if (!verbClass(lemma)) return false;
  // Treat as irregular if any present eu override differs from regular
  const form = resolveForm(`verb.${lemma}:pres:eu`);
  return Boolean(form && !form.irregular);
}

export function lemmaInVerifiedTable(lemma: string): boolean {
  const seed = loadConjugationSeed();
  return seed.verbs.some((v) => v.lemma === lemma && v.verified);
}

/** Replace a model-written form with the table form inside a line when possible. */
export function replaceFormFromTable(
  tl: string,
  lemma: string,
  tense: Tense,
  person: Person,
): string | null {
  const form = resolveForm(`verb.${lemma}:${tense}:${person}`);
  if (!form) return null;
  // If the line already contains the correct form, keep it
  if (tl.toLowerCase().includes(form.tl.toLowerCase())) return tl;
  // If model wrote something else for this lemma, we can't safely rewrite the whole sentence;
  // callers should drop lines that don't contain the table form.
  return null;
}
