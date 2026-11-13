import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  createMemoryProgressStore,
  handleProgressEvent,
} from '../lib/v2/progress/events';

describe('P9 · daily deck build-once', () => {
  it('two opens on the same day return the same cards', async () => {
    const store = createMemoryProgressStore();
    const now = new Date('2024-06-15T12:00:00.000Z');
    const cards = [
      { item_id: 'a', slot: 'recent' as const },
      { item_id: 'b', slot: 'weak' as const },
      { item_id: 'c', slot: 'older' as const },
    ];
    const first = await handleProgressEvent(
      {
        kind: 'deck_opened',
        event_id: randomUUID(),
        target_lang: 'pt-PT',
        local_date: '2024-06-15',
        cards,
      },
      { userId: 'u1', timezone: 'Europe/Lisbon', now, store },
    );
    const second = await handleProgressEvent(
      {
        kind: 'deck_opened',
        event_id: randomUUID(),
        target_lang: 'pt-PT',
        local_date: '2024-06-15',
        cards: [{ item_id: 'zzz', slot: 'recent' }],
      },
      { userId: 'u1', timezone: 'Europe/Lisbon', now, store },
    );
    assert.deepEqual(
      (first.deck as { cards: { item_id: string }[] }).cards.map((c) => c.item_id),
      ['a', 'b', 'c'],
    );
    assert.deepEqual(
      (second.deck as { cards: { item_id: string }[] }).cards.map(
        (c) => c.item_id,
      ),
      ['a', 'b', 'c'],
    );
  });

  it('a new local date builds a new deck; missed days build nothing', async () => {
    const store = createMemoryProgressStore();
    await handleProgressEvent(
      {
        kind: 'deck_opened',
        event_id: randomUUID(),
        target_lang: 'pt-PT',
        local_date: '2024-06-15',
        cards: [{ item_id: 'a', slot: 'recent' }],
      },
      {
        userId: 'u1',
        timezone: 'Europe/Lisbon',
        now: new Date('2024-06-15T12:00:00.000Z'),
        store,
      },
    );
    assert.equal(await store.getDeck('u1', '2024-06-16'), null);
    assert.equal(await store.getDeck('u1', '2024-06-14'), null);
    const next = await handleProgressEvent(
      {
        kind: 'deck_opened',
        event_id: randomUUID(),
        target_lang: 'pt-PT',
        local_date: '2024-06-16',
        cards: [{ item_id: 'b', slot: 'recent' }],
      },
      {
        userId: 'u1',
        timezone: 'Europe/Lisbon',
        now: new Date('2024-06-16T12:00:00.000Z'),
        store,
      },
    );
    assert.equal(
      (next.deck as { cards: { item_id: string }[] }).cards[0]?.item_id,
      'b',
    );
  });
});
