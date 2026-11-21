import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeMasterySummary,
  masteryLineEg,
} from '../lib/v2/practice/masterySummary';

describe('v2 practice · mastery summary (16 §8)', () => {
  it('counts match a seeded user; custom-only excluded', () => {
    const m = computeMasterySummary(
      [
        { item_id: 'food.cheese', stage: 4, item_type: 'word' },
        { item_id: 'food.bread', stage: 4, item_type: 'word' },
        { item_id: 'phrase.hi', stage: 4, item_type: 'phrase' },
        { item_id: 'food.milk', stage: 3, item_type: 'word' },
        { item_id: 'food.tea', stage: 2, item_type: 'word' },
        { item_id: 'ugc.pt-PT.chuva.noun', stage: 4, item_type: 'word' },
        { item_id: 'pattern.ser', stage: 4, item_type: 'pattern' },
      ],
      '2026-11-21',
    );
    assert.equal(m.mastered_words, 2);
    assert.equal(m.mastered_phrases, 1);
    assert.equal(m.recalled, 1);
    assert.equal(m.reviewing, 1);
    // pattern not in word count
    assert.equal(masteryLineEg(m), 'اتحفظت 2 كلمة · و 1 جملة');
  });

  it('before first graduation shows افتكرت N', () => {
    const m = computeMasterySummary([
      { item_id: 'a', stage: 3, item_type: 'word' },
      { item_id: 'b', stage: 3, item_type: 'word' },
    ]);
    assert.equal(masteryLineEg(m), 'افتكرت 2 كلمة');
  });
});
