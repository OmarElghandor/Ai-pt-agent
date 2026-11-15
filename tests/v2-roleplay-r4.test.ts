import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clearRoleplayLoadCache,
  encodeRoleplayTurnEvent,
  MemoryRoleplaySessionStore,
  MemoryRoleplayStarsStore,
  runRoleplayTurn,
  startRoleplaySession,
} from '../lib/v2/roleplay';
import { loadRoleplaySituation } from '../lib/v2/roleplay/load';
import {
  V2RoleplaySessionModel,
  V2RoleplayStarsModel,
} from '../lib/v2/mongo/roleplayModels';
import { USER_KEYED_V2_COLLECTIONS } from '../lib/v2/auth/userKeyedCollections';

describe('roleplay R4 API + stars store', () => {
  it('exports mongo model factories', () => {
    assert.equal(typeof V2RoleplaySessionModel, 'function');
    assert.equal(typeof V2RoleplayStarsModel, 'function');
  });

  it('registers roleplay collections as user-keyed', () => {
    assert.ok(USER_KEYED_V2_COLLECTIONS.includes('v2_roleplay_sessions'));
    assert.ok(USER_KEYED_V2_COLLECTIONS.includes('v2_roleplay_stars'));
  });

  it('start + turn + stars via memory stores', async () => {
    clearRoleplayLoadCache();
    const sessions = new MemoryRoleplaySessionStore();
    const stars = new MemoryRoleplayStarsStore();

    const started = await startRoleplaySession({
      userId: 'u-r4',
      situationId: 'rp.cafe',
      tier: 1,
      store: sessions,
    });
    assert.equal(started.resumed, false);
    assert.ok(started.state.id);
    assert.ok(started.events.some((e) => e.type === 'character'));

    const situation = loadRoleplaySituation('rp.cafe');
    const turn = await runRoleplayTurn({
      situation,
      state: started.state,
      learnerText: 'Bom dia! Queria um galão, por favor.',
    });
    await sessions.save(turn.state);
    assert.equal(turn.state.slots.drink, 'galão');

    const awarded = await stars.awardStar('u-r4', 'rp.cafe', 1);
    assert.deepEqual(awarded, [1]);
    const all = await stars.getAllStars('u-r4');
    assert.deepEqual(all['rp.cafe'], [1]);

    const resumed = await startRoleplaySession({
      userId: 'u-r4',
      situationId: 'rp.cafe',
      tier: 1,
      store: sessions,
    });
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.state.slots.drink, 'galão');
  });

  it('encodes NDJSON turn events', () => {
    const line = encodeRoleplayTurnEvent({ type: 'done', finished: false });
    assert.equal(line.endsWith('\n'), true);
    assert.equal(JSON.parse(line.trim()).type, 'done');
  });
});
