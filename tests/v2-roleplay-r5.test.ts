import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ROLE_PLAY_DAYS, isRolePlayDay } from '../lib/v2/convo/topics/rolePlay';
import {
  buildRoleplayCatalog,
  clearRoleplayLoadCache,
  loadRoleplayIndex,
} from '../lib/v2/roleplay';

describe('roleplay R5 list + catalog', () => {
  it('ROLE_PLAY_DAYS is empty so day 33 leaves the learn list', () => {
    assert.deepEqual([...ROLE_PLAY_DAYS], []);
    assert.ok(!isRolePlayDay(33));
  });

  it('catalog has 5 levels and 15 situations with hard badge', () => {
    clearRoleplayLoadCache();
    const catalog = buildRoleplayCatalog({
      learnerDay: 10,
      starsBySituation: { 'rp.cafe': [1] },
    });
    assert.equal(catalog.levels.length, 5);
    const all = catalog.levels.flatMap((l) => l.situations);
    assert.equal(all.length, 15);
    const cafe = all.find((s) => s.id === 'rp.cafe')!;
    assert.deepEqual(cafe.stars, [1]);
    assert.equal(cafe.hard_for_you, false); // day 10 >= recommended 9
    const financas = all.find((s) => s.id === 'rp.financas')!;
    assert.equal(financas.hard_for_you, true); // recommended 54
    const index = loadRoleplayIndex();
    assert.equal(index.tiers.length, 3);
  });
});
