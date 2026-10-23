import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Person, Tense } from '../items';
import { parseFormId } from './formId';
import { conjugateRegular } from './regular';

export { parseFormId } from './formId';

export type ResolvedForm = {
  tl: string;
  stem: string;
  ending: string;
  irregular: boolean;
  say: string;
};

type OverrideForm = {
  tl?: string;
  say?: string;
  /** @deprecated Ignored — irregularity is computed vs the regular rule. */
  irregular?: boolean;
  stem?: string;
  ending?: string;
};

type SeedVerb = {
  lemma: string;
  class: string;
  meaning_ar: string;
  verified: boolean;
  overrides: Partial<
    Record<Tense, Partial<Record<Person, OverrideForm>>>
  >;
};

type SeedFile = {
  target_lang: string;
  verbs: SeedVerb[];
};

let cachedSeed: SeedFile | null = null;

export function loadConjugationSeed(
  seedPath = join(process.cwd(), 'content/v2/conjugations/pt-PT.json'),
): SeedFile {
  if (cachedSeed) return cachedSeed;
  cachedSeed = JSON.parse(readFileSync(seedPath, 'utf8')) as SeedFile;
  return cachedSeed;
}

/** Test helper — clear module cache between tests if needed. */
export function resetConjugationSeedCache(): void {
  cachedSeed = null;
}

export function resolveForm(
  id: string,
  seed: SeedFile = loadConjugationSeed(),
): ResolvedForm | null {
  const parsed = parseFormId(id);
  if (!parsed) return null;
  const { lemma, tense, person } = parsed;

  const verb = seed.verbs.find((v) => v.lemma === lemma);
  if (!verb) return null;

  const regular = conjugateRegular(lemma, tense, person);
  const override = verb.overrides?.[tense]?.[person];
  const tl = override?.tl ?? regular?.tl;
  if (!tl) return null;

  const irregular = regular ? tl !== regular.tl : true;
  const say = override?.say ?? '';

  if (!irregular && regular) {
    return {
      tl: regular.tl,
      stem: regular.stem,
      ending: regular.ending,
      irregular: false,
      say,
    };
  }

  // Truly irregular: prefer explicit stem/ending if provided, else whole form
  return {
    tl,
    stem: override?.stem ?? '',
    ending: override?.ending ?? tl,
    irregular: true,
    say,
  };
}

export function hasForm(
  id: string,
  seed: SeedFile = loadConjugationSeed(),
): boolean {
  return resolveForm(id, seed) != null;
}

export type { SeedFile, SeedVerb };
