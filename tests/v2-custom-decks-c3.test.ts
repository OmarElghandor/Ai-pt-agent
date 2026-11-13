import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchTopicAgainstDeck } from '../lib/v2/decks/find';
import { customDeckQuota } from '../lib/v2/decks/quota';
import { filterPreviewWords } from '../lib/v2/decks/save';
import type { CheckedWord } from '../lib/v2/decks/generate/checks';

describe('C3 · quota gate', () => {
  it('refuses the 4th generation in a day', () => {
    const q = customDeckQuota(
      { id: 'u1' },
      { userUsed: 3, globalUsed: 3, userLimit: 3 },
    );
    assert.equal(q.allowed, false);
    assert.equal(q.reason, 'user_cap');
    assert.equal(q.userRemaining, 0);
  });

  it('allows when under the daily cap', () => {
    const q = customDeckQuota(
      { id: 'u1' },
      { userUsed: 2, globalUsed: 2, userLimit: 3 },
    );
    assert.equal(q.allowed, true);
    assert.equal(q.userRemaining, 1);
  });
});

describe('C3 · save gate', () => {
  it('refuses saving with fewer than 15 words after removals', () => {
    const words = Array.from({ length: 20 }, (_, i) => ({
      tl: `o w${i}`,
      lemma: `w${i}`,
      key: `w${i}`,
      pos: 'noun' as const,
      gender: 'm' as const,
      ar: 'ك',
      example_tl: `o w${i} ok`,
      example_ar: 'ك',
      say: 'س',
      concept_en: `w${i}`,
    })) as CheckedWord[];
    const removed = words.slice(0, 6).map((w) => w.lemma);
    const remaining = filterPreviewWords(words, removed);
    assert.equal(remaining.length, 14);
    assert.ok(remaining.length < 15);
  });

  it('allows save when 15+ remain', () => {
    const words = Array.from({ length: 20 }, (_, i) => ({
      tl: `o w${i}`,
      lemma: `w${i}`,
      key: `w${i}`,
      pos: 'noun' as const,
      gender: 'm' as const,
      ar: 'ك',
      example_tl: `o w${i} ok`,
      example_ar: 'ك',
      say: 'س',
      concept_en: `w${i}`,
    })) as CheckedWord[];
    const remaining = filterPreviewWords(words, ['w0', 'w1']);
    assert.equal(remaining.length, 18);
    assert.ok(remaining.length >= 15);
  });
});

describe('C3 · find existing (no model)', () => {
  it('matches topic against titles and tags', () => {
    assert.equal(
      matchTopicAgainstDeck(
        { title_tl: 'Tempo', title_ar: 'الطقس', tags: ['weather'] },
        'الطقس',
      ),
      true,
    );
    assert.equal(
      matchTopicAgainstDeck(
        { title_tl: 'Cozinha', title_ar: 'المطبخ', tags: ['kitchen'] },
        'الطقس',
      ),
      false,
    );
  });
});
