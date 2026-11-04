import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildConvoResultStats } from '@/lib/v2/convo/result';
import { createConvoSessionDoc } from '@/lib/v2/convo/session';
import {
  createStubConvoStreamModel,
  runConvoTurn,
} from '@/lib/v2/convo/turn';
import { MemoryConvoSessionStore } from '@/lib/v2/convo/session';
import { surfaceTlFor } from '@/lib/v2/convo/pack';
import { DAY18_PACK, DAY18_SURFACES } from './fixtures/convo/day18-script';

describe('v2 convo result stats', () => {
  it('splits said / understood / extra and builds the headline', () => {
    const session = createConvoSessionDoc({
      id: 'r1',
      userId: 'u',
      pack: DAY18_PACK,
    });
    session.rungs['word.right'] = 'said';
    session.rungs['word.left'] = 'assisted';
    session.rungs['phrase.go_straight'] = 'understood';
    session.rungs['word.station'] = 'heard';
    session.survival_used = 2;

    const stats = buildConvoResultStats({
      session,
      pack: DAY18_PACK,
      surfaceTl: (id) => surfaceTlFor(DAY18_SURFACES, id),
    });

    assert.equal(stats.say_count, 1);
    assert.equal(stats.understand_count, 3);
    assert.equal(stats.headline_eg, 'بتفهم +3 · بتقول +1');
    assert.equal(stats.said[0]?.item_id, 'word.right');
    assert.ok(stats.understood.some((x) => x.item_id === 'word.left'));
    assert.ok(stats.understood.some((x) => x.item_id === 'phrase.go_straight'));
    assert.equal(stats.extra[0]?.item_id, 'word.station');
    assert.equal(stats.survival_used, 2);
  });
});

describe('v2 convo survival', () => {
  it('replays without calling the model and increments survival_used', async () => {
    const store = new MemoryConvoSessionStore();
    let session = createConvoSessionDoc({
      id: 'surv',
      userId: 'u',
      pack: DAY18_PACK,
    });
    session.pending_question = {
      id: 'q_right_open',
      kind: 'open',
      item_id: 'word.right',
    };
    session.last_exchanges = [
      { role: 'character', tl: 'E agora?' },
    ];
    await store.create(session);

    const model = createStubConvoStreamModel({});

    const events: Array<{ type: string }> = [];
    const result = await runConvoTurn({
      session,
      pack: DAY18_PACK,
      surfaces: DAY18_SURFACES,
      learnerText: '',
      store,
      model,
      survival: 'nao_percebi',
      emit: (e) => events.push(e),
    });

    assert.equal(model.calls, 0);
    assert.equal(result.session.survival_used, 1);
    const q = events.find((e) => e.type === 'question') as
      | { type: 'question'; tl: string }
      | undefined;
    assert.ok(q);
    assert.equal(q!.tl, 'Para que lado?');
  });
});
