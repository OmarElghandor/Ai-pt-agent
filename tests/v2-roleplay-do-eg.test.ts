import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clearRoleplayLoadCache,
  createRoleplaySessionState,
  loadRoleplaySituation,
  resolveRoleplaySpeaker,
  runRoleplayTurn,
  startRoleplayScene,
} from '../lib/v2/roleplay';

describe('roleplay hints-only · character · resume', () => {
  it('rp.cafe fresh start: Manuel line only — no intro card, no do strip', () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    const state = createRoleplaySessionState({
      id: 'do-eg-fresh',
      user_id: 'u',
      situation_id: 'rp.cafe',
      first_step_id: 'order_drink',
    });
    const started = startRoleplayScene({
      situation: cafe,
      state,
      resume: false,
    });

    assert.ok(
      !started.events.some(
        (e) => e.type === 'coach' && e.eg.includes('كنا فين'),
      ),
      'fresh start must never emit the resume note',
    );
    assert.ok(
      !started.events.some((e) => e.type === 'coach' && e.moment === 'intro'),
    );
    assert.ok(!started.events.some((e) => e.type === 'do'));

    const line = started.events.find((e) => e.type === 'character');
    assert.ok(line);
    if (line?.type === 'character') {
      assert.equal(line.tl, 'Bom dia! Diga.');
      assert.equal(line.name, 'Manuel');
      assert.equal(line.character_id, 'manuel');
    }
  });

  it('after Queria um galão advances to order_food without a do event', async () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    let state = createRoleplaySessionState({
      id: 'do-eg-turn',
      user_id: 'u',
      situation_id: 'rp.cafe',
      first_step_id: 'order_drink',
    });
    state = startRoleplayScene({
      situation: cafe,
      state,
      resume: false,
    }).state;

    const turn = await runRoleplayTurn({
      situation: cafe,
      state,
      learnerText: 'Queria um galão',
    });

    assert.ok(!turn.events.some((e) => e.type === 'do'));
    assert.equal(turn.state.current_step_id, 'order_food');
    const chars = turn.events.filter((e) => e.type === 'character');
    assert.equal(chars.length, 1);
  });

  it('scene character is Manuel for rp.cafe — never a default', () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    const resolved = resolveRoleplaySpeaker(cafe);
    assert.equal(resolved.name, 'Manuel');
    assert.equal(resolved.character_id, 'manuel');
    assert.ok(resolved.voice.includes('Duarte'));
  });

  it('resume still emits كنا فين', () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    const state = createRoleplaySessionState({
      id: 'do-eg-resume',
      user_id: 'u',
      situation_id: 'rp.cafe',
      first_step_id: 'order_drink',
    });
    const started = startRoleplayScene({ situation: cafe, state });
    const resumed = startRoleplayScene({
      situation: cafe,
      state: started.state,
      resume: true,
    });
    assert.ok(
      resumed.events.some(
        (e) => e.type === 'coach' && e.eg.includes('كنا فين'),
      ),
    );
    assert.ok(
      !resumed.events.some(
        (e) => e.type === 'coach' && e.moment === 'intro',
      ),
    );
  });
});
