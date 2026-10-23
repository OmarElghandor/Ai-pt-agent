import type { Person, Tense } from '../items';

export type VerbClass = 'ar' | 'er' | 'ir';

export type RegularForm = {
  tl: string;
  stem: string;
  ending: string;
  irregular: false;
};

const PRES: Record<VerbClass, Record<Person, string>> = {
  ar: { eu: 'o', tu: 'as', ele: 'a', nos: 'amos', eles: 'am' },
  er: { eu: 'o', tu: 'es', ele: 'e', nos: 'emos', eles: 'em' },
  ir: { eu: 'o', tu: 'es', ele: 'e', nos: 'imos', eles: 'em' },
};

/** pt-PT: nós pretérito of -ar verbs keeps the accent (falámos). */
const PRET: Record<VerbClass, Record<Person, string>> = {
  ar: { eu: 'ei', tu: 'aste', ele: 'ou', nos: 'ámos', eles: 'aram' },
  er: { eu: 'i', tu: 'este', ele: 'eu', nos: 'emos', eles: 'eram' },
  ir: { eu: 'i', tu: 'iste', ele: 'iu', nos: 'imos', eles: 'iram' },
};

export function verbClass(lemma: string): VerbClass | null {
  if (lemma.endsWith('ar')) return 'ar';
  if (lemma.endsWith('er')) return 'er';
  if (lemma.endsWith('ir')) return 'ir';
  return null;
}

/**
 * Orthographic adjustments that keep the sound when the ending starts with e/o.
 * These are regular spelling changes, not irregularities.
 */
function applySpellingChange(
  lemma: string,
  tense: Tense,
  person: Person,
  stem: string,
  ending: string,
): { stem: string; ending: string; tl: string } {
  // pret eu: -car → -quei, -gar → -guei, -çar → -cei
  if (tense === 'pret' && person === 'eu' && lemma.endsWith('ar')) {
    if (lemma.endsWith('car')) {
      const base = lemma.slice(0, -3);
      return { stem: `${base}qu`, ending: 'ei', tl: `${base}quei` };
    }
    if (lemma.endsWith('gar')) {
      const base = lemma.slice(0, -3);
      return { stem: `${base}gu`, ending: 'ei', tl: `${base}guei` };
    }
    if (lemma.endsWith('çar')) {
      const base = lemma.slice(0, -3);
      return { stem: `${base}c`, ending: 'ei', tl: `${base}cei` };
    }
  }

  // pres eu: -cer → -ço, -ger/-gir → -jo
  if (tense === 'pres' && person === 'eu') {
    if (lemma.endsWith('cer')) {
      const base = lemma.slice(0, -3);
      return { stem: `${base}ç`, ending: 'o', tl: `${base}ço` };
    }
    if (lemma.endsWith('ger') || lemma.endsWith('gir')) {
      const base = lemma.slice(0, -3);
      return { stem: `${base}j`, ending: 'o', tl: `${base}jo` };
    }
  }

  return { stem, ending, tl: stem + ending };
}

export function conjugateRegular(
  lemma: string,
  tense: Tense,
  person: Person,
): RegularForm | null {
  const cls = verbClass(lemma);
  if (!cls) return null;
  if (tense !== 'pres' && tense !== 'pret') return null;

  const stem = lemma.slice(0, -2);
  const ending = (tense === 'pres' ? PRES : PRET)[cls][person];
  const spelled = applySpellingChange(lemma, tense, person, stem, ending);
  return {
    tl: spelled.tl,
    stem: spelled.stem,
    ending: spelled.ending,
    irregular: false,
  };
}
