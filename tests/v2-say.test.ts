import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applySayToItems,
  transliteratePtToSay,
} from '../lib/v2/content/translit';

describe('transliteratePtToSay · goldens (Day 2 v8)', () => {
  it('matches fixed review words', () => {
    assert.equal(transliteratePtToSay('Queria'), 'كِريا');
    assert.equal(transliteratePtToSay('por favor'), 'پور فاڤور');
    assert.equal(transliteratePtToSay('obrigado'), 'أوبريجادو');
    assert.equal(transliteratePtToSay('água'), 'آجوا');
    assert.equal(transliteratePtToSay('leite'), 'لايت');
    assert.equal(transliteratePtToSay('gosto'), 'جوشتو');
  });

  it('uses required letters پ ڤ چ غ ج', () => {
    assert.match(transliteratePtToSay('por'), /پ/);
    assert.match(transliteratePtToSay('favor'), /ڤ/);
    assert.match(transliteratePtToSay('queijo'), /چ/);
    assert.match(transliteratePtToSay('rua'), /^غ/);
    assert.match(transliteratePtToSay('obrigado'), /ج/);
    assert.doesNotMatch(transliteratePtToSay('gosto'), /غ/);
  });

  it('applySayToItems overwrites say from tl', () => {
    const out = applySayToItems([
      { type: 'phrase', id: 'phrase.x', tl: 'Queria', say: 'WRONG' },
      { type: 'pattern', id: 'pattern.x', tl: undefined, say: undefined },
    ]);
    assert.equal(out[0]!.say, 'كِريا');
    assert.equal(out[1]!.say, undefined);
  });

  it('maps final é → يه and bare é → إيه', () => {
    assert.equal(transliteratePtToSay('café'), 'كَفيه');
    assert.equal(transliteratePtToSay('é'), 'إيه');
  });

  it('maps ? and , to Arabic punctuation in say', () => {
    assert.match(transliteratePtToSay('Queria?'), /؟$/);
    assert.match(transliteratePtToSay('olá,'), /،$/);
  });
});
