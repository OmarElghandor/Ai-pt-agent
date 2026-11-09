import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateAnswer } from '@/lib/v2/answers/evaluate';
import { parseAnswerPayload } from '@/lib/v2/answers/payload';
import { withIdempotency, MemoryIdempotencyStore } from '@/lib/v2/answers';
import {
  createItemState,
  endOfTomorrow,
  type ItemState,
} from '@/lib/v2/progress';
import {
  convoProgressAnswerId,
  diffConvoRungProgress,
  mirrorConvoProgress,
} from '@/lib/v2/convo/progress';
import { createConvoSessionDoc } from '@/lib/v2/convo/session';
import { requireConvoPack, loadConvoItemSurfaces } from '@/lib/v2/convo/pack';

const pack = requireConvoPack('pt-PT.day-33', {
  itemSurfaces: loadConvoItemSurfaces(),
});

describe('v2 convo progress · rung diff', () => {
  it('emits only newly reached mirrorable rungs', () => {
    const transitions = diffConvoRungProgress(
      { 'word.right': 'taught', 'word.left': 'understood' },
      {
        'word.right': 'heard',
        'word.left': 'said',
        'word.station': 'assisted',
      },
    );
    assert.deepEqual(
      transitions.map((t) => [t.item_id, t.to]),
      [
        ['word.right', 'heard'],
        ['word.left', 'said'],
        ['word.station', 'assisted'],
      ],
    );
  });

  it('answer ids are stable UUIDs for the same session/item/rung', () => {
    const a = convoProgressAnswerId({
      sessionId: 's1',
      itemId: 'word.right',
      rung: 'said',
    });
    const b = convoProgressAnswerId({
      sessionId: 's1',
      itemId: 'word.right',
      rung: 'said',
    });
    assert.equal(a, b);
    assert.ok(parseAnswerPayload({
      kind: 'convo',
      answer_id: a,
      day: 18,
      item_id: 'word.right',
      rung: 'said',
    }));
  });
});

describe('v2 convo progress · evaluate kind=convo', () => {
  it('maps heard / understood / said to levels', async () => {
    const base = createItemState({
      user_id: 'u1',
      item_id: 'word.right',
      introducedDay: 18,
    });
    const heard = await evaluateAnswer(
      {
        kind: 'convo',
        answer_id: '11111111-1111-4111-8111-111111111111',
        day: 18,
        item_id: 'word.right',
        rung: 'heard',
      },
      { user_id: 'u1', localDate: '2026-11-04', itemState: base },
    );
    assert.equal(heard.correct, true);
    assert.ok((heard.item_state?.levels.heard ?? 0) >= 1);

    const understood = await evaluateAnswer(
      {
        kind: 'convo',
        answer_id: '22222222-2222-4222-8222-222222222222',
        day: 18,
        item_id: 'word.right',
        rung: 'understood',
      },
      {
        user_id: 'u1',
        localDate: '2026-11-04',
        itemState: heard.item_state,
      },
    );
    assert.ok((understood.item_state?.levels.understood ?? 0) >= 1);

    const said = await evaluateAnswer(
      {
        kind: 'convo',
        answer_id: '33333333-3333-4333-8333-333333333333',
        day: 18,
        item_id: 'word.right',
        rung: 'said',
      },
      {
        user_id: 'u1',
        localDate: '2026-11-04',
        itemState: understood.item_state,
      },
    );
    assert.ok((said.item_state?.levels.said ?? 0) >= 1);
  });

  it('assisted bumps understood and schedules tomorrow card, not said', async () => {
    const base = createItemState({
      user_id: 'u1',
      item_id: 'word.street',
      introducedDay: 10,
    });
    const now = new Date('2026-11-04T12:00:00Z');
    const result = await evaluateAnswer(
      {
        kind: 'convo',
        answer_id: '44444444-4444-4444-8444-444444444444',
        day: 18,
        item_id: 'word.street',
        rung: 'assisted',
      },
      {
        user_id: 'u1',
        localDate: '2026-11-04',
        itemState: base,
        now,
      },
    );
    assert.equal(result.skill, 'reading');
    assert.ok((result.item_state?.levels.understood ?? 0) >= 1);
    assert.equal(result.item_state?.levels.said ?? 0, 0);
    const due = result.item_state?.card.dueAt;
    assert.ok(due);
    assert.equal(due, endOfTomorrow(now).toISOString());
  });
});

describe('v2 convo progress · mirror idempotency', () => {
  it('replaying the same transitions writes once', async () => {
    const session = createConvoSessionDoc({
      id: 'sess-prog',
      userId: 'u1',
      pack,
    });
    const store = new MemoryIdempotencyStore();
    const states = new Map<string, ItemState>();

    const write = async (
      payload: Parameters<typeof evaluateAnswer>[0],
    ) => {
      return withIdempotency(payload.answer_id, store, async () => {
        if (payload.kind !== 'convo') throw new Error('expected convo');
        const existing = states.get(payload.item_id) ?? null;
        const verdict = await evaluateAnswer(payload, {
          user_id: 'u1',
          localDate: '2026-11-04',
          itemState: existing,
        });
        if (verdict.item_state) {
          states.set(payload.item_id, verdict.item_state);
        }
        return verdict;
      });
    };

    const before = { ...session.rungs };
    const after = {
      ...session.rungs,
      'word.station': 'understood' as const,
      'word.street': 'said' as const,
    };

    const first = await mirrorConvoProgress({
      session,
      day: 18,
      beforeRungs: before,
      afterRungs: after,
      write,
    });
    assert.equal(first.writes, 2);
    assert.equal(first.duplicates, 0);

    const second = await mirrorConvoProgress({
      session,
      day: 18,
      beforeRungs: before,
      afterRungs: after,
      write,
    });
    assert.equal(second.writes, 2);
    assert.equal(second.duplicates, 2);

    assert.ok((states.get('word.station')?.levels.understood ?? 0) === 1);
    assert.ok((states.get('word.street')?.levels.said ?? 0) === 1);
  });
});
