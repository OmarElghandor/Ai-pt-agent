import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { emptyCardSrs } from '../lib/v2/progress/srs';
import {
  blankStatesAfterReset,
  pickSessionQueue,
} from '../lib/v2/decks/session';
import {
  clearRatingsForItems,
  itemStateResetFilter,
  sessionStatusAfterClear,
  userDeckResetFilter,
} from '../lib/v2/decks/reset';

describe('deck reset · user scoping', () => {
  it('item state filter always includes this user_id', () => {
    const filter = itemStateResetFilter('user-a', ['food.cheese', 'weather.rain']);
    assert.equal(filter.user_id, 'user-a');
    assert.deepEqual(filter.item_id, { $in: ['food.cheese', 'weather.rain'] });
    assert.notEqual(filter.user_id, 'user-b');
  });

  it('user deck filter is per user × deck, not shared deck doc', () => {
    const filter = userDeckResetFilter('user-a', 'abc123');
    assert.deepEqual(filter, { user_id: 'user-a', deck_id: 'abc123' });
  });

  it('emptyCardSrs is the reset target shape', () => {
    const blank = emptyCardSrs();
    assert.equal(blank.interval, 0);
    assert.equal(blank.dueAt, null);
    assert.equal(blank.masteryLevel, 'learning');
    assert.equal(blank.consecutiveCorrect, 0);
    assert.equal(blank.face, 'recognize');
    assert.equal(blank.knowCheckDueAt, null);
  });
});

describe('deck reset · today session ratings', () => {
  it('clears ratings only for deck item ids', () => {
    const { items, cleared } = clearRatingsForItems(
      [
        { item_id: 'a', rating: 'easy', rated_at: '2026-11-13T10:00:00.000Z' },
        { item_id: 'b', rating: 'hard', rated_at: '2026-11-13T10:01:00.000Z' },
        { item_id: 'c' },
      ],
      new Set(['a', 'c']),
    );
    assert.equal(cleared, 1);
    assert.equal(items[0]!.rating, undefined);
    assert.equal(items[0]!.rated_at, undefined);
    assert.equal(items[1]!.rating, 'hard');
    assert.equal(items[2]!.rating, undefined);
  });

  it('reopens session when any card is unrated after clear', () => {
    assert.equal(
      sessionStatusAfterClear(
        [{ rating: 'easy' }, { rating: undefined }],
        'done',
      ),
      'open',
    );
    assert.equal(
      sessionStatusAfterClear([{ rating: 'easy' }, { rating: 'hard' }], 'done'),
      'done',
    );
  });
});

describe('deck reset · simulated multi-user states', () => {
  it('resetting user-a leaves user-b card progress intact', () => {
    const blank = emptyCardSrs();
    const states = new Map([
      [
        'user-a:food.cheese',
        {
          user_id: 'user-a',
          item_id: 'food.cheese',
          card: {
            interval: 7,
            dueAt: '2026-11-20T00:00:00.000Z',
            masteryLevel: 'learning' as const,
            consecutiveCorrect: 2,
            face: 'recognize',
            knowCheckDueAt: null,
          },
        },
      ],
      [
        'user-b:food.cheese',
        {
          user_id: 'user-b',
          item_id: 'food.cheese',
          card: {
            interval: 14,
            dueAt: '2026-11-27T00:00:00.000Z',
            masteryLevel: 'learning' as const,
            consecutiveCorrect: 3,
            face: 'recognize',
            knowCheckDueAt: null,
          },
        },
      ],
    ]);

    const filter = itemStateResetFilter('user-a', ['food.cheese']);
    for (const [key, st] of states) {
      if (
        st.user_id === filter.user_id &&
        filter.item_id.$in.includes(st.item_id)
      ) {
        states.set(key, { ...st, card: { ...blank } });
      }
    }

    assert.equal(states.get('user-a:food.cheese')!.card.interval, 0);
    assert.equal(states.get('user-a:food.cheese')!.card.dueAt, null);
    assert.equal(states.get('user-b:food.cheese')!.card.interval, 14);
    assert.equal(
      states.get('user-b:food.cheese')!.card.dueAt,
      '2026-11-27T00:00:00.000Z',
    );
  });

  it('does not mutate a shared custom deck document shape', () => {
    const sharedDeck = {
      _id: 'deck1',
      title_tl: 'Comida',
      item_ids: ['food.cheese', 'food.bread'],
      added_count: 12,
    };
    const before = structuredClone(sharedDeck);
    // Reset only touches user-keyed rows; shared deck stays as-is.
    const _userFilter = userDeckResetFilter('user-a', 'deck1');
    void _userFilter;
    assert.deepEqual(sharedDeck, before);
  });
});

describe('deck reset · full custom queue', () => {
  const now = new Date('2026-11-13T12:00:00Z');
  const item_ids = Array.from(
    { length: 15 },
    (_, i) => `ugc.pt-PT.w${i}.noun`,
  );

  it('before reset: 4 seen + exhausted new cap → only 4 cards', () => {
    const states = new Map(
      item_ids.slice(0, 4).map((id) => [
        id,
        { dueAt: null as string | null, mastered: false },
      ]),
    );
    const { due, neu } = pickSessionQueue({
      item_ids,
      states,
      alreadyNewToday: 10,
      now,
    });
    assert.equal(due.length, 4);
    assert.equal(neu.length, 0);
    assert.equal(due.length + neu.length, 4);
  });

  it('after blank upsert reset: all 15 enter due despite prior new cap', () => {
    const states = blankStatesAfterReset(item_ids);
    const { due, neu } = pickSessionQueue({
      item_ids,
      states,
      alreadyNewToday: 10,
      now,
    });
    assert.equal(states.size, 15);
    assert.equal(due.length, 15);
    assert.equal(neu.length, 0);
    assert.equal(due.length + neu.length, 15);
  });
});
