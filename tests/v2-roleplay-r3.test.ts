import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clearRoleplayLoadCache,
  createRoleplaySessionState,
  loadRoleplaySituation,
  playableSteps,
  runRoleplayTurn,
  startRoleplayScene,
} from '../lib/v2/roleplay';

describe('roleplay R3 session engine', () => {
  it('tier 1 playable steps exclude min_tier 2/3', () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    const t1 = playableSteps(cafe, 1, {});
    assert.ok(t1.every((s) => s.min_tier <= 1));
    assert.ok(!t1.some((s) => s.id === 'no_galao'));
    assert.ok(!t1.some((s) => s.id === 'here_or_go'));
  });

  it('if_slot cash_only only when pay=cartão', () => {
    clearRoleplayLoadCache();
    const mercado = loadRoleplaySituation('rp.mercado');
    const without = playableSteps(mercado, 1, {});
    assert.ok(!without.some((s) => s.id === 'cash_only'));
    const withCard = playableSteps(mercado, 1, { pay: 'cartão' });
    assert.ok(withCard.some((s) => s.id === 'cash_only'));
  });

  it('start emits character says; resume adds كنا فين', () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    const state = createRoleplaySessionState({
      id: 's1',
      user_id: 'u1',
      situation_id: 'rp.cafe',
      tier: 1,
      first_step_id: 'order_drink',
    });
    const started = startRoleplayScene({ situation: cafe, state });
    assert.ok(started.events.some((e) => e.type === 'character'));
    const resumed = startRoleplayScene({
      situation: cafe,
      state,
      resume: true,
    });
    const coach = resumed.events.find(
      (e) => e.type === 'coach' && e.eg.includes('كنا فين'),
    );
    assert.ok(coach);
  });

  it('3 wrong answers assist the step and advance (no dead end)', async () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    let state = createRoleplaySessionState({
      id: 's2',
      user_id: 'u1',
      situation_id: 'rp.cafe',
      tier: 1,
      first_step_id: 'order_drink',
    });
    for (let i = 0; i < 3; i++) {
      const r = await runRoleplayTurn({
        situation: cafe,
        state,
        learnerText: 'zzzz not portuguese',
      });
      state = r.state;
    }
    assert.ok(state.assisted_steps.includes('order_drink'));
    assert.notEqual(state.current_step_id, 'order_drink');
    assert.equal(state.model_calls, 0);
  });

  it('side channel language question makes zero model calls', async () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    const state = createRoleplaySessionState({
      id: 's3',
      user_id: 'u1',
      situation_id: 'rp.cafe',
      tier: 1,
      first_step_id: 'order_drink',
    });
    let modelCalls = 0;
    const r = await runRoleplayTurn(
      {
        situation: cafe,
        state,
        learnerText: 'يعني إيه Diga؟',
      },
      {
        modelReactionsEnabled: true,
        modelReaction: async () => {
          modelCalls += 1;
          return 'x';
        },
      },
    );
    assert.equal(modelCalls, 0);
    assert.equal(r.state.model_calls, 0);
    assert.equal(r.state.current_step_id, 'order_drink');
    assert.ok(r.events.some((e) => e.type === 'coach'));
  });

  it('matched turn advances and still zero model calls', async () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    const state = createRoleplaySessionState({
      id: 's4',
      user_id: 'u1',
      situation_id: 'rp.cafe',
      tier: 1,
      first_step_id: 'order_drink',
    });
    const r = await runRoleplayTurn({
      situation: cafe,
      state,
      learnerText: 'Bom dia! Queria um galão, por favor.',
    });
    assert.equal(r.state.slots.drink, 'galão');
    assert.equal(r.state.current_step_id, 'order_food');
    assert.equal(r.state.model_calls, 0);
    assert.ok(r.state.alone_steps.includes('order_drink'));
  });
});
