import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  containsItemSurface,
  loadConvoPack,
  loadConvoPackFromFile,
  validateConvoPack,
  type ConvoItemSurface,
  type ConvoPackData,
} from '@/lib/v2/convo/pack';

const FIXTURE_DIR = path.join(process.cwd(), 'tests/fixtures/convo');
const PACK_PATH = path.join(FIXTURE_DIR, 'pt-PT.day-18.json');

function surfaces(): ConvoItemSurface[] {
  return JSON.parse(
    readFileSync(path.join(FIXTURE_DIR, 'item-surfaces.json'), 'utf8'),
  ) as ConvoItemSurface[];
}

function validPack(): ConvoPackData {
  return JSON.parse(readFileSync(PACK_PATH, 'utf8')) as ConvoPackData;
}

function clonePack(): ConvoPackData {
  return structuredClone(validPack());
}

function hasRule(
  issues: { rule: string }[],
  rule: string,
): boolean {
  return issues.some((i) => i.rule === rule);
}

describe('v2 convo pack', () => {
  it('valid minimal day-18 fixture passes', () => {
    const result = validateConvoPack(validPack(), {
      itemSurfaces: surfaces(),
    });
    assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
    assert.ok(result.pack);
    assert.equal(result.pack.pack_id, 'pt-PT.day-18');
    assert.equal(result.pack.visual.type, 'map');
  });

  it('loader reads the fixture from a content-style directory', () => {
    const result = loadConvoPack('pt-PT.day-18', {
      baseDir: FIXTURE_DIR,
      itemSurfaces: surfaces(),
    });
    assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
    assert.equal(result.pack?.day, 18);
  });

  it('loadConvoPackFromFile returns the same pack', () => {
    const result = loadConvoPackFromFile(PACK_PATH, {
      itemSurfaces: surfaces(),
    });
    assert.equal(result.ok, true);
    assert.equal(result.filePath, PACK_PATH);
  });

  it('containsItemSurface matches with and without article', () => {
    assert.equal(containsItemSurface('Direita ou esquerda?', 'à direita'), true);
    assert.equal(containsItemSurface('E agora?', 'à direita'), false);
    assert.equal(containsItemSurface('Estação ou farmácia?', 'a estação'), true);
  });

  it('fails when a core item has no choice question', () => {
    const pack = clonePack();
    pack.items['word.right'].choice_questions = [];
    const result = validateConvoPack(pack, { itemSurfaces: surfaces() });
    assert.equal(result.ok, false);
    assert.ok(hasRule(result.issues, 'choice_min'));
  });

  it('fails when a core item has no open question', () => {
    const pack = clonePack();
    pack.items['word.right'].open_questions = [];
    const result = validateConvoPack(pack, { itemSurfaces: surfaces() });
    assert.equal(result.ok, false);
    assert.ok(hasRule(result.issues, 'open_min'));
  });

  it('fails when a core item is missing from the recap', () => {
    const pack = clonePack();
    pack.recap.questions = pack.recap.questions.filter(
      (q) => q.item_id !== 'word.right',
    );
    const result = validateConvoPack(pack, { itemSurfaces: surfaces() });
    assert.equal(result.ok, false);
    assert.ok(hasRule(result.issues, 'recap_coverage'));
  });

  it('fails when a choice question does not contain the item', () => {
    const pack = clonePack();
    pack.items['word.right'].choice_questions[0].tl = 'Sim ou não?';
    const result = validateConvoPack(pack, { itemSurfaces: surfaces() });
    assert.equal(result.ok, false);
    assert.ok(hasRule(result.issues, 'choice_contains_item'));
  });

  it('fails when an open question contains the item', () => {
    const pack = clonePack();
    pack.items['word.right'].open_questions[0].tl = 'Vai à direita?';
    const result = validateConvoPack(pack, { itemSurfaces: surfaces() });
    assert.equal(result.ok, false);
    assert.ok(hasRule(result.issues, 'open_omits_item'));
  });

  it('fails when a map open question references a missing step', () => {
    const pack = clonePack();
    pack.items['word.right'].open_questions[0].map_step = 'no_such_step';
    const result = validateConvoPack(pack, { itemSurfaces: surfaces() });
    assert.equal(result.ok, false);
    assert.ok(hasRule(result.issues, 'map_step_exists'));
  });

  it('fails schema when groups exceed max 4', () => {
    const pack = clonePack();
    pack.groups = [
      ...pack.groups,
      { id: 'g3', item_ids: ['word.station'] },
      { id: 'g4', item_ids: ['word.street'] },
      { id: 'g5', item_ids: ['word.pharmacy'] },
    ];
    const result = validateConvoPack(pack, { itemSurfaces: surfaces() });
    assert.equal(result.ok, false);
    assert.ok(hasRule(result.issues, 'schema'));
  });
});
