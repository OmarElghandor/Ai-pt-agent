import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';
import { LessonPackSchema } from '../lib/v2/content/lesson';
import {
  hasErrors,
  validateLessonPack,
  type LessonPack,
} from '../lib/v2/content';
import { conjugateRegular } from '../lib/v2/content/conjugations/regular';
import {
  loadConjugationSeed,
  resolveForm,
} from '../lib/v2/content/conjugations/resolve';

function loadDay6(): LessonPack {
  const raw = JSON.parse(
    readFileSync(resolve(process.cwd(), 'examples/day06-example.json'), 'utf8'),
  );
  const parsed = LessonPackSchema.parse(raw);
  return parsed;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

describe('v2 content · day06', () => {
  it('passes in normal mode with one pages_count warning', () => {
    const pack = loadDay6();
    const result = validateLessonPack(pack, { mode: 'normal' });
    assert.equal(hasErrors(result), false);
    const warnings = result.issues.filter((i) => i.severity === 'warning');
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]!.rule, 'pages_count');
  });

  it('pages_count is an error in strict mode', () => {
    const pack = loadDay6();
    const result = validateLessonPack(pack, { mode: 'strict' });
    assert.equal(hasErrors(result), true);
    assert.ok(result.issues.some((i) => i.rule === 'pages_count' && i.severity === 'error'));
  });
});

describe('v2 content · broken fixtures', () => {
  it('bad_ref', () => {
    const pack = clone(loadDay6());
    const compare = pack.pages[0]!.blocks.find((b) => b.type === 'compare');
    assert.ok(compare && compare.type === 'compare');
    compare.columns[0]!.entries[0]!.ref = 'sentence.does_not_exist';
    const result = validateLessonPack(pack, { mode: 'normal' });
    assert.ok(result.issues.some((i) => i.rule === 'bad_ref'));
  });

  it('bad_form_id', () => {
    const pack = clone(loadDay6());
    const table = pack.pages[1]!.blocks.find((b) => b.type === 'table');
    assert.ok(table && table.type === 'table');
    table.cells[0]![0] = { ref: 'verb.estar:pres:vós' };
    const result = validateLessonPack(pack, { mode: 'normal' });
    assert.ok(result.issues.some((i) => i.rule === 'bad_form_id'));
  });

  it('ask_too_early', () => {
    const pack = clone(loadDay6());
    pack.pages[0]!.steps![1]!.kind = 'ask';
    pack.pages[0]!.steps![1]!.ask = {
      question: [{ text: 'x', lang: 'eg' }],
      options: [
        { label: [{ text: 'a', lang: 'tl' }], correct: true },
        { label: [{ text: 'b', lang: 'tl' }], correct: false },
      ],
    };
    const result = validateLessonPack(pack, { mode: 'normal' });
    assert.ok(result.issues.some((i) => i.rule === 'ask_too_early'));
  });

  it('table_cell_count', () => {
    const pack = clone(loadDay6());
    const table = pack.pages[1]!.blocks.find((b) => b.type === 'table');
    assert.ok(table && table.type === 'table');
    table.cells[0] = [{ ref: 'verb.estar:pres:eu' }];
    const result = validateLessonPack(pack, { mode: 'normal' });
    assert.ok(result.issues.some((i) => i.rule === 'table_cell_count'));
  });

  it('raw_mixed_string', () => {
    const pack = clone(loadDay6());
    pack.lesson.situation = { tl: 'hello مرحبا', eg: 'test' };
    const result = validateLessonPack(pack, { mode: 'normal' });
    assert.ok(result.issues.some((i) => i.rule === 'raw_mixed_string'));
  });
});

describe('v2 conjugations', () => {
  it('regular falar/comer/abrir in pres and pret (incl. falámos)', () => {
    const falarNosPret = conjugateRegular('falar', 'pret', 'nos');
    assert.ok(falarNosPret);
    assert.equal(falarNosPret.tl, 'falámos');
    assert.equal(falarNosPret.ending, 'ámos');

    assert.equal(conjugateRegular('falar', 'pres', 'eu')!.tl, 'falo');
    assert.equal(conjugateRegular('comer', 'pres', 'tu')!.tl, 'comes');
    assert.equal(conjugateRegular('abrir', 'pres', 'eles')!.tl, 'abrem');
    assert.equal(conjugateRegular('comer', 'pret', 'ele')!.tl, 'comeu');
    assert.equal(conjugateRegular('abrir', 'pret', 'nos')!.tl, 'abrimos');
  });

  it('spelling-change rules: chegar → cheguei, ficar → fiquei (not irregular)', () => {
    const cheguei = conjugateRegular('chegar', 'pret', 'eu');
    assert.ok(cheguei);
    assert.equal(cheguei.tl, 'cheguei');
    assert.equal(cheguei.stem, 'chegu');
    assert.equal(cheguei.ending, 'ei');
    assert.equal(cheguei.irregular, false);

    const fiquei = conjugateRegular('ficar', 'pret', 'eu');
    assert.ok(fiquei);
    assert.equal(fiquei.tl, 'fiquei');
    assert.equal(fiquei.stem, 'fiqu');
    assert.equal(fiquei.ending, 'ei');
    assert.equal(fiquei.irregular, false);

    const seed = loadConjugationSeed();
    assert.equal(resolveForm('verb.chegar:pret:eu', seed)?.irregular, false);
    assert.equal(resolveForm('verb.ficar:pret:eu', seed)?.tl, 'fiquei');
    assert.equal(resolveForm('verb.ficar:pret:eu', seed)?.irregular, false);
  });

  it('irregular is per-form vs the regular rule', () => {
    const seed = loadConjugationSeed();
    const estou = resolveForm('verb.estar:pres:eu', seed);
    assert.equal(estou?.tl, 'estou');
    assert.equal(estou?.irregular, true);

    const estamos = resolveForm('verb.estar:pres:nos', seed);
    assert.equal(estamos?.tl, 'estamos');
    assert.equal(estamos?.irregular, false);

    const estao = resolveForm('verb.estar:pres:eles', seed);
    assert.equal(estao?.tl, 'estão');
    assert.equal(estao?.irregular, true);
  });

  it('irregular overrides for ser/estar/ir/ter/dormir', () => {
    const seed = loadConjugationSeed();
    assert.equal(resolveForm('verb.ser:pres:eu', seed)?.tl, 'sou');
    assert.equal(resolveForm('verb.estar:pres:eu', seed)?.tl, 'estou');
    assert.equal(resolveForm('verb.ir:pres:eu', seed)?.tl, 'vou');
    assert.equal(resolveForm('verb.ter:pres:eu', seed)?.tl, 'tenho');
    const durmo = resolveForm('verb.dormir:pres:eu', seed);
    assert.equal(durmo?.tl, 'durmo');
    assert.equal(durmo?.irregular, true);
  });

  it('ele form resolves for você / o senhor', () => {
    const seed = loadConjugationSeed();
    const ele = resolveForm('verb.estar:pres:ele', seed);
    assert.ok(ele);
    assert.equal(ele.tl, 'está');
    // você and o senhor use the ele row
    assert.equal(resolveForm('verb.ser:pres:ele', seed)?.tl, 'é');
  });
});
