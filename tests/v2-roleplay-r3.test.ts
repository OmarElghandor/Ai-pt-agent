import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildRoleplayCatalog,
  clearRoleplayLoadCache,
  encodeRoleplayTurnEvent,
  finishWithChips,
  loadRoleplayIndex,
  loadRoleplaySituation,
  MemoryRoleplaySessionStore,
  runRoleplayTurn,
  startRoleplaySession,
} from '../lib/v2/roleplay';
import { V2RoleplaySessionModel } from '../lib/v2/mongo/roleplayModels';
import { USER_KEYED_V2_COLLECTIONS } from '../lib/v2/auth/userKeyedCollections';

describe('roleplay R3 API and path progress', () => {
  it('exports session model and registers sessions as user-keyed', () => {
    assert.equal(typeof V2RoleplaySessionModel, 'function');
    assert.ok(USER_KEYED_V2_COLLECTIONS.includes('v2_roleplay_sessions'));
    assert.equal(
      USER_KEYED_V2_COLLECTIONS.includes('v2_roleplay_stars' as never),
      false,
    );
  });

  it('start + turn + soft end keep resume pointer', async () => {
    clearRoleplayLoadCache();
    const sessions = new MemoryRoleplaySessionStore();

    const started = await startRoleplaySession({
      userId: 'u-r3',
      situationId: 'rp.cafe',
      store: sessions,
    });
    assert.equal(started.resumed, false);
    assert.ok(started.events.some((e) => e.type === 'character'));

    const situation = loadRoleplaySituation('rp.cafe');
    const turn = await runRoleplayTurn({
      situation,
      state: started.state,
      learnerText: 'Bom dia! Queria um galão, por favor.',
    });
    await sessions.save(turn.state);
    assert.equal(turn.state.slots.drink, 'galão');
    assert.equal(turn.state.status, 'active');

    // Soft leave: session stays active.
    const left = await sessions.get(turn.state.id, 'u-r3');
    assert.ok(left);
    assert.equal(left!.status, 'active');
    assert.ok(left!.current_step_id);

    const resumed = await startRoleplaySession({
      userId: 'u-r3',
      situationId: 'rp.cafe',
      store: sessions,
    });
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.state.slots.drink, 'galão');
    assert.equal(resumed.state.current_step_id, turn.state.current_step_id);
    assert.ok(
      resumed.events.some(
        (e) => e.type === 'coach' && e.eg.includes('كنا فين'),
      ),
    );
  });

  it('next scene is the first unfinished in path order', async () => {
    clearRoleplayLoadCache();
    const sessions = new MemoryRoleplaySessionStore();
    const index = loadRoleplayIndex();
    assert.equal(index.path[0].id, 'rp.cafe');

    let catalog = buildRoleplayCatalog({
      finishedIds: [],
      activeSituationIds: [],
    });
    assert.equal(catalog.next?.id, 'rp.cafe');
    assert.equal(catalog.path_finished, false);

    // Finish café via chips, mark done in store.
    const cafe = loadRoleplaySituation('rp.cafe');
    const finished = await finishWithChips({ situation: cafe });
    assert.equal(finished.state.status, 'done');
    finished.state.user_id = 'u-path';
    await sessions.save(finished.state);

    const finishedIds = await sessions.listFinishedSituationIds('u-path');
    catalog = buildRoleplayCatalog({
      finishedIds,
      activeSituationIds: [],
    });
    assert.equal(catalog.next?.id, 'rp.mercado');
    assert.equal(catalog.past.map((p) => p.id).includes('rp.cafe'), true);
  });

  it('path_finished when all 15 are done', () => {
    clearRoleplayLoadCache();
    const index = loadRoleplayIndex();
    const catalog = buildRoleplayCatalog({
      finishedIds: index.path.map((p) => p.id),
      activeSituationIds: [],
    });
    assert.equal(catalog.next, null);
    assert.equal(catalog.path_finished, true);
    assert.equal(catalog.past.length, 15);
  });

  it('encodes NDJSON turn events', () => {
    const line = encodeRoleplayTurnEvent({ type: 'done', finished: false });
    assert.equal(line.endsWith('\n'), true);
    assert.equal(JSON.parse(line.trim()).type, 'done');
  });
});
