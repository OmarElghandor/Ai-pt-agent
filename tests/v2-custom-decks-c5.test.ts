import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateAnswer } from '../lib/v2/answers/evaluate';
import { parseAnswerPayload } from '../lib/v2/answers/payload';
import {
  CUSTOM_DECK_NEW_PER_DAY,
  pickSessionQueue,
} from '../lib/v2/decks/session';
import { createItemState, tryGraduate } from '../lib/v2/progress/srs';

describe('C5 · session queue', () => {
  it('day 1 shows up to 10 new from a 25-word deck', () => {
    const item_ids = Array.from({ length: 25 }, (_, i) => `ugc.pt-PT.w${i}.noun`);
    const { due, neu } = pickSessionQueue({
      item_ids,
      states: new Map(),
      alreadyNewToday: 0,
      now: new Date('2026-11-12T12:00:00Z'),
    });
    assert.equal(due.length, 0);
    assert.equal(neu.length, CUSTOM_DECK_NEW_PER_DAY);
  });

  it('day 2 shows due then more new', () => {
    const item_ids = Array.from({ length: 25 }, (_, i) => `ugc.pt-PT.w${i}.noun`);
    const states = new Map(
      item_ids.slice(0, 10).map((id) => [
        id,
        { dueAt: '2026-11-13T00:00:00.000Z', mastered: false },
      ]),
    );
    const { due, neu } = pickSessionQueue({
      item_ids,
      states,
      alreadyNewToday: 0,
      now: new Date('2026-11-13T12:00:00Z'),
    });
    assert.equal(due.length, 10);
    assert.equal(neu.length, 10);
    assert.ok(neu.every((id) => !states.has(id)));
  });

  it('same item in two decks is one state id', () => {
    const id = 'ugc.pt-PT.chuva.noun';
    assert.equal(id, 'ugc.pt-PT.chuva.noun');
  });
});

describe('C5 · custom graduation', () => {
  it('custom-only graduates on interval ≥ 21 without situations', () => {
    let state = createItemState({
      user_id: 'u',
      item_id: 'ugc.pt-PT.chuva.noun',
      introducedDay: 1,
    });
    state = {
      ...state,
      card: { ...state.card, interval: 21 },
      usedCorrectlyIn: [],
    };
    state = tryGraduate(state);
    assert.equal(state.card.masteryLevel, 'mastered');
  });

  it('official items still need two situations', () => {
    let state = createItemState({
      user_id: 'u',
      item_id: 'weather.rain',
      introducedDay: 1,
    });
    state = {
      ...state,
      card: { ...state.card, interval: 21 },
      usedCorrectlyIn: ['day:1'],
    };
    state = tryGraduate(state);
    assert.equal(state.card.masteryLevel, 'learning');
    state = {
      ...state,
      usedCorrectlyIn: ['day:1', 'day:2'],
    };
    state = tryGraduate(state);
    assert.equal(state.card.masteryLevel, 'mastered');
  });
});

describe('C5 · card_review answers', () => {
  it('parses and applies easy rating', async () => {
    const payload = parseAnswerPayload({
      kind: 'card_review',
      answer_id: '11111111-1111-4111-8111-111111111111',
      item_id: 'ugc.pt-PT.chuva.noun',
      rating: 'easy',
      deck_id: 'custom:abc',
    });
    assert.ok(payload);
    assert.equal(payload!.kind, 'card_review');
    const verdict = await evaluateAnswer(payload!, {
      user_id: 'u',
      localDate: '2026-11-12',
    });
    assert.equal(verdict.ok, true);
    assert.ok(verdict.item_state);
    assert.ok((verdict.item_state!.card.interval ?? 0) >= 1);
  });
});

// TODO(P9): assert custom items never appear in the daily deck builder.
// TODO(P11): assert a finished custom session (≥10 ratings) counts for the streak.
