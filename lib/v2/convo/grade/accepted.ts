import { stripAccents } from '@/lib/v2/answers/normalize';

const ARTICLES_PREPS = [
  'o',
  'a',
  'os',
  'as',
  'à',
  'ao',
  'às',
  'aos',
  'um',
  'uma',
  'de',
  'do',
  'da',
  'dos',
  'das',
  'em',
  'no',
  'na',
  'nos',
  'nas',
];

/** Formal ↔ informal imperative pairs (pt-PT A1 directions). */
const IMPERATIVE_PAIRS: Array<[string, string]> = [
  ['vire', 'vira'],
  ['siga', 'segue'],
  ['vá', 'vai'],
];

/** Common gender endings to swap for accepted variants. */
const GENDER_SWAPS: Array<[RegExp, string]> = [
  [/direita\b/gi, 'direito'],
  [/direito\b/gi, 'direita'],
  [/esquerda\b/gi, 'esquerdo'],
  [/esquerdo\b/gi, 'esquerda'],
  [/cansada\b/gi, 'cansado'],
  [/cansado\b/gi, 'cansada'],
];

function add(set: Set<string>, s: string): void {
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t) return;
  set.add(t);
  set.add(stripAccents(t));
}

function stripLeadingArticlePrep(s: string): string {
  const re = new RegExp(
    `^(${ARTICLES_PREPS.map((a) => a.replace(/à/g, 'à')).join('|')})\\s+`,
    'i',
  );
  return s.replace(re, '').trim();
}

function withArticleVariants(base: string): string[] {
  const core = stripLeadingArticlePrep(base);
  const out = new Set<string>();
  add(out, base);
  add(out, core);
  // Common direction forms
  if (/^(direita|esquerda|direito|esquerdo)\b/i.test(core)) {
    add(out, `à ${core}`);
    add(out, `a ${core}`);
  }
  for (const art of ['o', 'a', 'os', 'as', 'à', 'ao']) {
    add(out, `${art} ${core}`);
  }
  return [...out];
}

function withImperativeVariants(forms: string[]): string[] {
  const out = new Set(forms);
  for (const form of forms) {
    const lower = form.toLowerCase();
    for (const [a, b] of IMPERATIVE_PAIRS) {
      if (lower.startsWith(a + ' ') || lower === a) {
        add(out, form.replace(new RegExp(`^${a}`, 'i'), capitalizeLike(form, b)));
      }
      if (lower.startsWith(b + ' ') || lower === b) {
        add(out, form.replace(new RegExp(`^${b}`, 'i'), capitalizeLike(form, a)));
      }
    }
  }
  return [...out];
}

function capitalizeLike(original: string, replacement: string): string {
  if (!original) return replacement;
  if (original[0] === original[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function withGenderVariants(forms: string[]): string[] {
  const out = new Set(forms);
  for (const form of forms) {
    for (const [re, repl] of GENDER_SWAPS) {
      const copy = new RegExp(re.source, re.flags);
      if (copy.test(form)) {
        add(out, form.replace(new RegExp(re.source, re.flags), repl));
      }
    }
  }
  return [...out];
}

/**
 * Build accepted answer forms from an item's tl surface:
 * ± article/preposition, accentless, vire/vira (etc.), gender variants.
 */
export function buildConvoAcceptedForms(
  expectedTl: string,
  extras: string[] = [],
): string[] {
  const base = expectedTl.replace(/[.?!,;:]+$/g, '').trim();
  if (!base) return extras.filter(Boolean);

  let forms = withArticleVariants(base);
  forms = withImperativeVariants(forms);
  forms = withGenderVariants(forms);

  // Phrase like "Vire à esquerda." → also accept the direction fragment alone.
  const withoutImperative = base.replace(
    /^(vire|vira|siga|segue|vá|vai)\s+/i,
    '',
  );
  if (withoutImperative !== base) {
    forms = [...forms, ...withArticleVariants(withoutImperative)];
    forms = withGenderVariants(forms);
  } else if (/direita|esquerda|direito|esquerdo/i.test(base)) {
    // Bare direction item → also accept "Vire/Vira …" as a full answer.
    const prefixed: string[] = [];
    for (const f of withArticleVariants(base)) {
      prefixed.push(`Vire ${f}`, `Vira ${f}`, `vire ${f}`, `vira ${f}`);
    }
    forms = [...forms, ...prefixed];
  }

  const set = new Set<string>();
  for (const f of forms) add(set, f);
  for (const e of extras) add(set, e);
  return [...set];
}
