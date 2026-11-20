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
import type { ConvoSession } from '@/lib/v2/convo/session/types';

before(() => {
  clearSceneLoadCache();
});

describe('scene goal heal (format-3 id rename)', () => {
  it('remaps cafe.order_drink → order_drink preserving status', () => {
    const bank = loadSceneBank('cena-cafe');
    const remapped = remapSceneGoalStatesToBank(
      bank.goals.map((g) => ({
        id: `cafe.${g.id}`,
        status: (g.id === 'order_drink' ? 'done' : 'open') as
          | 'done'
          | 'open',
      })),
      bank,
    );
    assert.ok(remapped);
    assert.equal(remapped![0].id, 'order_drink');
    assert.equal(remapped![0].status, 'done');
    const food = remapped!.find((g) => g.id === 'order_food');
    assert.equal(food?.status, 'open');
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
    let session = started.session as ConvoSession;
    session.goals = bank.goals.map((g) => ({
      id: `cafe.${g.id}`,
      status: 'open' as const,
    }));
    session.current_goal = 'cafe.order_drink';
    assert.equal(sceneSessionGoalsMatchBank(session, bank), false);

    const healed = healSceneSessionAgainstBank(session, bank, 'm');
    assert.equal(healed, true);
    assert.equal(sceneSessionGoalsMatchBank(session, bank), true);
    assert.equal(session.current_goal, 'order_drink');
    assert.deepEqual(
      session.goals.map((g) => g.id),
      bank.goals.map((g) => g.id),
    );
  });
});
