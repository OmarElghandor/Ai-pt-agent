import { findBrazilianLeak } from '@/lib/v2/convo/output/checks';
import { transliteratePtToSay } from '@/lib/v2/content/translit';
import { leadingArticle, normaliseLemma } from '../keys';
import type { GeneratedWord } from './schema';

const ARABIC_RE = /[\u0600-\u06FF]/
const LATIN_RE = /[A-Za-zÀ-ÿ]/

/** Extra Brazilian lemmas for deck checks (12 §2.4), beyond findBrazilianLeak. */
const DECK_BRAZILIAN = [
  'geladeira',
  'ônibus',
  'onibus',
  'trem',
  'banheiro',
  'café da manhã',
  'cafe da manha',
  'celular',
];

function hasBrazilianForm(text: string): boolean {
  if (findBrazilianLeak(text)) return true;
  const lower = text.toLowerCase();
  return DECK_BRAZILIAN.some((w) => lower.includes(w));
}

export type CheckedWord = GeneratedWord & {
  say: string;
  lemma: string;
};

export type DropReason =
  | 'brazilian'
  | 'slash_in_tl'
  | 'noun_article'
  | 'noun_gender'
  | 'ar_empty'
  | 'ar_not_arabic'
  | 'eg_note_mixed'
  | 'example_missing_word'
  | 'example_too_long'
  | 'example_brazilian'
  | 'example_ar_empty'
  | 'example_ar_not_arabic'
  | 'concept_en_bad'
  | 'duplicate'
  | 'conjugations';

const CONCEPT_EN_RE = /^[a-z][a-z0-9_]*$/;

export type CheckResult = {
  kept: CheckedWord[];
  dropped: { word: GeneratedWord; reason: DropReason }[];
};

function isRawMixed(value: string): boolean {
  return ARABIC_RE.test(value) && LATIN_RE.test(value);
}

function exampleContainsLemma(example: string, tl: string): boolean {
  const lemma = normaliseLemma(tl);
  const ex = example.normalize('NFC').toLowerCase();
  return ex.includes(lemma);
}

function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Drop failing words; never rewrite them by hand (12 §2.4).
 * Strips any conjugations field the model may have sent.
 */
export function checkGeneratedWords(words: GeneratedWord[]): CheckResult {
  const kept: CheckedWord[] = [];
  const dropped: CheckResult['dropped'] = [];
  const seen = new Set<string>();

  for (const raw of words) {
    const { conjugations: _c, ...word } = raw;
    void _c;
    if (raw.conjugations != null) {
      // Still allow the infinitive card; conjugations are ignored (never stored).
    }

    if (word.tl.includes('/')) {
      dropped.push({ word, reason: 'slash_in_tl' });
      continue;
    }
    if (hasBrazilianForm(word.tl)) {
      dropped.push({ word, reason: 'brazilian' });
      continue;
    }
    if (word.pos === 'noun') {
      const art = leadingArticle(word.tl);
      if (!art) {
        dropped.push({ word, reason: 'noun_article' });
        continue;
      }
      if (word.gender !== 'm' && word.gender !== 'f') {
        dropped.push({ word, reason: 'noun_gender' });
        continue;
      }
      const masc = art === 'o' || art === 'os' || art === 'um';
      const fem = art === 'a' || art === 'as' || art === 'uma';
      if ((word.gender === 'm' && !masc) || (word.gender === 'f' && !fem)) {
        dropped.push({ word, reason: 'noun_gender' });
        continue;
      }
    }
    if (!word.ar.trim()) {
      dropped.push({ word, reason: 'ar_empty' });
      continue;
    }
    if (!ARABIC_RE.test(word.ar)) {
      dropped.push({ word, reason: 'ar_not_arabic' });
      continue;
    }
    if (word.eg_note && isRawMixed(word.eg_note)) {
      dropped.push({ word, reason: 'eg_note_mixed' });
      continue;
    }
    if (wordCount(word.example_tl) > 8) {
      dropped.push({ word, reason: 'example_too_long' });
      continue;
    }
    if (!exampleContainsLemma(word.example_tl, word.tl)) {
      dropped.push({ word, reason: 'example_missing_word' });
      continue;
    }
    if (hasBrazilianForm(word.example_tl)) {
      dropped.push({ word, reason: 'example_brazilian' });
      continue;
    }
    if (!word.example_ar?.trim()) {
      dropped.push({ word, reason: 'example_ar_empty' });
      continue;
    }
    if (!ARABIC_RE.test(word.example_ar)) {
      dropped.push({ word, reason: 'example_ar_not_arabic' });
      continue;
    }
    const concept = (word.concept_en ?? '').trim().toLowerCase();
    if (!CONCEPT_EN_RE.test(concept)) {
      dropped.push({ word, reason: 'concept_en_bad' });
      continue;
    }

    const lemma = normaliseLemma(word.tl);
    if (seen.has(lemma)) {
      dropped.push({ word, reason: 'duplicate' });
      continue;
    }
    seen.add(lemma);

    kept.push({
      ...word,
      concept_en: concept,
      lemma,
      say: transliteratePtToSay(word.tl),
      // Never persist conjugations
      conjugations: undefined,
    });
  }

  return { kept, dropped };
}
