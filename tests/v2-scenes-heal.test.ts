/**
 * Format-3 cut-over: heal old cafe.* session goal ids.
 */
import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import {
  healSceneSessionAgainstBank,
  remapSceneGoalStatesToBank,
  sceneSessionGoalsMatchBank,
} from '@/lib/v2/convo/goals';
import {
  clearSceneLoadCache,
  loadSceneBank,
} from '@/lib/v2/convo/scenes';
import {
  MemoryConvoSessionStore,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';
import {
  createStubConvoStreamModel,
  runFreeConvoTurn,
  type ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn';
import type { SceneQwenResult } from '@/lib/v2/convo/scenes/qwenScene';
import type { ConvoSession } from '@/lib/v2/convo/session/types';

const OTHER: SceneQwenResult = {
  kind: 'other',
  goal: null,
  option: null,
  corrected: '',
  has_error: false,
  note_eg: '',
};

before(() => {
  clearSceneLoadCache();
});

describe('scene goal heal (format-3 id rename)', () => {
  it('remaps cafe.order_drink → order_drink preserving status', () => {
    const bank = loadSceneBank('cena-cafe');
    const remapped = remapSceneGoalStatesToBank(
      [
        { id: 'cafe.order_drink', status: 'done' },
        { id: 'cafe.order_food', status: 'open' },
        { id: 'cafe.here_or_go', status: 'open' },
        { id: 'cafe.ask_price', status: 'open' },
        { id: 'cafe.pay', status: 'open' },
        { id: 'cafe.contribuinte', status: 'open' },
        { id: 'cafe.bye', status: 'open' },
      ],
      bank,
    );
    assert.ok(remapped);
    assert.equal(remapped![0].id, 'order_drink');
    assert.equal(remapped![0].status, 'done');
    assert.equal(remapped![1].id, 'order_food');
    assert.equal(remapped![1].status, 'open');
  });

  it('healed session then matches café order', async () => {
    const bank = loadSceneBank('cena-cafe');
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'heal',
      topicId: 'cena-cafe',
      store,
      learnerLevel: 9,
      newId: () => 'heal-sess',
    });
    // Simulate a pre-format-3 Mongo session.
    let session = started.session as ConvoSession;
    session.goals = bank.goals.map((g) => ({
      id: `cafe.${g.id}`,
      status: 'open' as const,
    }));
    session.current_goal = 'cafe.order_drink';
    assert.equal(sceneSessionGoalsMatchBank(session, bank), false);

    const healed = healSceneSessionAgainstBank(session, bank, 'm');
    assert.equal(healed, true);
    assert.equal(session.current_goal, 'order_drink');
    assert.equal(sceneSessionGoalsMatchBank(session, bank), true);

    const events: ConvoTurnStreamEvent[] = [];
    const out = await runFreeConvoTurn({
      session,
      learnerText: 'Queria um café, por favor',
      store,
      model: createStubConvoStreamModel({ byCandidate: () => 'NO' }),
      emit: (e) => events.push(e),
      stubSceneQwen: OTHER,
    });
    const bubble = events.find((e) => e.type === 'bubble_ar');
    assert.ok(bubble && bubble.type === 'bubble_ar');
    assert.match(
      bubble.pt ?? '',
      /Um café, saindo!/,
    );
    assert.equal(
      out.session.goals.find((g) => g.id === 'order_drink')?.status,
      'done',
    );
    assert.equal(out.session.current_goal, 'order_food');
  });
});
