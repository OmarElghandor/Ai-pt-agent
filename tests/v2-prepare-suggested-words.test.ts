import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  situationEgForDay,
  suggestedWordsForDay,
} from '@/lib/v2/convo/session/suggestedWords';

describe('suggestedWordsForDay', () => {
  it('returns core TLS for a known day', () => {
    const words = suggestedWordsForDay(1);
    assert.ok(words.length > 0);
    assert.ok(words.every((w) => typeof w === 'string' && w.trim()));
  });

  it('caps at 15', () => {
    const words = suggestedWordsForDay(1, 3);
    assert.ok(words.length <= 3);
  });
});

describe('situationEgForDay', () => {
  it('returns Egyptian situation for day 1', () => {
    const eg = situationEgForDay(1);
    assert.ok(eg);
    assert.ok(eg!.length > 0);
  });
});
