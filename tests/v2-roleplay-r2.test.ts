import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clearRoleplayLoadCache,
  loadRoleplaySituation,
  matchRoleplayStep,
  matchRoleplayWithLookahead,
} from '../lib/v2/roleplay';

describe('roleplay R2 matcher', () => {
  it('Bom dia + galão completes order_drink with drink=galão', () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    const step = cafe.steps.find((s) => s.id === 'order_drink')!;
    const hit = matchRoleplayStep(
      'Bom dia! Queria um galão, por favor.',
      step,
    );
    assert.ok(hit);
    assert.equal(hit!.step_id, 'order_drink');
    assert.equal(hit!.slot, 'drink');
    assert.equal(hit!.slot_value, 'galão');
    assert.equal(hit!.via, 'option');
  });

  it('Ida e volta sets trip=ida e volta, not só ida', () => {
    clearRoleplayLoadCache();
    const comboio = loadRoleplaySituation('rp.comboio');
    const step = comboio.steps.find((s) => s.id === 'return')!;
    const hit = matchRoleplayStep('Ida e volta', step);
    assert.ok(hit);
    assert.equal(hit!.slot_value, 'ida e volta');
    assert.notEqual(hit!.slot_value, 'só ida');
  });

  it('Pode repetir? on direcoes confirm stays open', () => {
    clearRoleplayLoadCache();
    const direcoes = loadRoleplaySituation('rp.direcoes');
    const step = direcoes.steps.find((s) => s.id === 'confirm')!;
    const hit = matchRoleplayStep('Pode repetir?', step);
    assert.ok(hit);
    assert.equal(hit!.stay, true);
    assert.equal(hit!.slot_value, 'again');
  });

  it('sim does not complete order_drink', () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    const step = cafe.steps.find((s) => s.id === 'order_drink')!;
    const hit = matchRoleplayStep('sim', step);
    assert.equal(hit, null);
  });

  it('look-ahead can complete greeting+order in one message against cafe steps', () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    // Single step still returns one hit; multi-step look-ahead uses playable list.
    const playable = cafe.steps.filter((s) => s.min_tier <= 1).slice(0, 2);
    const hits = matchRoleplayWithLookahead(
      'Bom dia! Queria um galão, por favor.',
      playable,
    );
    assert.equal(hits[0]?.step_id, 'order_drink');
    // Second step (no_galao is tier 3; at tier 1 next is order_food) — galão message
    // should not complete order_food.
    assert.equal(hits.length, 1);
  });
});
