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

describe('roleplay do_eg · intro · character · resume', () => {
  it('rp.cafe fresh start: intro card → Manuel line → do_eg; no resume note', () => {
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

    const meaningful = started.events.filter(
      (e) =>
        e.type === 'coach' ||
        e.type === 'character' ||
        e.type === 'do',
    );
    assert.ok(meaningful.length >= 3);

    const intro = meaningful[0];
    assert.equal(intro?.type, 'coach');
    if (intro?.type === 'coach') {
      assert.equal(intro.moment, 'intro');
      assert.ok(intro.eg.includes(cafe.place_eg));
      assert.ok(intro.eg.includes(cafe.learner_role_eg));
      assert.ok(intro.eg.includes(cafe.task_eg));
      assert.ok(intro.eg.includes('دورك'));
      assert.ok(intro.eg.includes('المهمة'));
    }

    const line = meaningful[1];
    assert.equal(line?.type, 'character');
    if (line?.type === 'character') {
      assert.equal(line.tl, 'Bom dia! Diga.');
      assert.equal(line.name, 'Manuel');
      assert.equal(line.character_id, 'manuel');
    }

    const doEvt = meaningful[2];
    assert.equal(doEvt?.type, 'do');
    if (doEvt?.type === 'do') {
      assert.equal(
        doEvt.eg,
        'Manuel بيقولك «اؤمر». اطلب مشروب ☕',
      );
    }
  });

  it('after Queria um galão the do strip moves to order_food', async () => {
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

    const orderFood = cafe.steps.find((s) => s.id === 'order_food')!;
    const doEvents = turn.events.filter((e) => e.type === 'do');
    assert.ok(doEvents.length >= 1);
    const lastDo = doEvents[doEvents.length - 1];
    assert.equal(lastDo?.type, 'do');
    if (lastDo?.type === 'do') {
      assert.equal(lastDo.eg, orderFood.do_eg);
      assert.equal(lastDo.step_id, 'order_food');
    }
    assert.equal(turn.state.current_step_id, 'order_food');
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
