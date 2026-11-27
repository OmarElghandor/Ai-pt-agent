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

const LETTER_RE = /[A-Za-zÀ-ÿ]/;

function isLetterAt(text: string, index: number): boolean {
  if (index < 0 || index >= text.length) return false;
  return LETTER_RE.test(text[index]!);
}

/**
 * Mark the first matching rule_highlight token in a line.
 * Longer tokens win (`nos` before `no`). Hyphen clitics (`-me`, `-o`)
 * must sit after a hyphen attached to a verb word («Compro-o», «ajudar-me»).
 */
export function highlightTokensInLine(
  tl: string,
  tokens: string[],
): HighlightSpan | null {
  if (!tokens.length) return null;
  const lower = tl.toLowerCase();
  const ordered = [...tokens].sort((a, b) => b.length - a.length);
  let best: HighlightSpan | null = null;

  for (const raw of ordered) {
    const token = raw.trim();
    if (!token) continue;
    const needle = token.toLowerCase();

    if (needle.startsWith('-')) {
      // Clitic: require a letter immediately before the hyphen, then the clitic.
      const clitic = needle.slice(1);
      if (!clitic) continue;
      let from = 0;
      while (from < lower.length) {
        const hy = lower.indexOf(`-${clitic}`, from);
        if (hy < 0) break;
        const end = hy + 1 + clitic.length;
        const beforeOk = isLetterAt(lower, hy - 1);
        const afterOk = !isLetterAt(lower, end);
        if (beforeOk && afterOk) {
          const span = { start: hy, end };
          if (!best || span.start < best.start) best = span;
          break;
        }
        from = hy + 1;
      }
      continue;
    }

    let from = 0;
    while (from < lower.length) {
      const idx = lower.indexOf(needle, from);
      if (idx < 0) break;
      const end = idx + needle.length;
      const beforeOk = !isLetterAt(lower, idx - 1);
      const afterOk = !isLetterAt(lower, end);
      if (beforeOk && afterOk) {
        const span = { start: idx, end };
        if (!best || span.start < best.start) best = span;
        break;
      }
      from = idx + 1;
    }
  }

  return best;
}

/** Regular verified lemmas from the conjugation seed (for rule clip prompts). */
export function listRegularVerifiedLemmas(): string[] {
  const seed = loadConjugationSeed();
  return seed.verbs
    .map((v) => v.lemma)
    .filter((lemma) => isRegularVerifiedLemma(lemma))
    .sort();
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
