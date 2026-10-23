#!/usr/bin/env tsx
import {
  loadConjugationSeed,
  resolveForm,
} from '../../lib/v2/content/conjugations/resolve';
import type { Person, Tense } from '../../lib/v2/content/items';

const PERSONS: Person[] = ['eu', 'tu', 'ele', 'nos', 'eles'];
const TENSES: Tense[] = ['pres', 'pret'];

const lemmas = process.argv.slice(2);
const seed = loadConjugationSeed();
const list =
  lemmas.length > 0
    ? lemmas
    : seed.verbs.map((v) => v.lemma);

for (const lemma of list) {
  const verb = seed.verbs.find((v) => v.lemma === lemma);
  if (!verb) {
    console.error(`Unknown lemma: ${lemma}`);
    continue;
  }
  console.log(`\n=== ${lemma} (${verb.class}) — ${verb.meaning_ar} · verified:${verb.verified} ===`);
  for (const tense of TENSES) {
    console.log(`\n${tense}`);
    console.log('person'.padEnd(8), 'tl'.padEnd(14), 'stem'.padEnd(10), 'ending'.padEnd(10), 'irr', 'say');
    for (const person of PERSONS) {
      const id = `verb.${lemma}:${tense}:${person}`;
      const form = resolveForm(id, seed);
      if (!form) {
        console.log(person.padEnd(8), '—');
        continue;
      }
      console.log(
        person.padEnd(8),
        form.tl.padEnd(14),
        form.stem.padEnd(10),
        form.ending.padEnd(10),
        form.irregular ? '⚡' : ' ',
        form.say,
      );
    }
  }
}

process.exit(0);
