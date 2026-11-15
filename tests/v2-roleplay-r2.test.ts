import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyLearnerName,
  characterSays,
  clearRoleplayLoadCache,
  createRoleplaySessionState,
  loadRoleplaySituation,
  matchRoleplayStep,
  matchRoleplayWithLookahead,
  pickLine,
  playableSteps,
  runRoleplayTurn,
  startRoleplayScene,
} from '../lib/v2/roleplay';

describe('roleplay R2 matcher and engine', () => {
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
    assert.equal(matchRoleplayStep('sim', step), null);
  });

  it('look-ahead does not complete the next food step from a drink order', () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    const playable = playableSteps(cafe, {}).slice(0, 2);
    const hits = matchRoleplayWithLookahead(
      'Bom dia! Queria um galão, por favor.',
      playable,
    );
    assert.equal(hits[0]?.step_id, 'order_drink');
    assert.equal(hits.length, 1);
  });

  it('if_slot cash_only only when pay=cartão', () => {
    clearRoleplayLoadCache();
    const mercado = loadRoleplaySituation('rp.mercado');
    assert.ok(!playableSteps(mercado, {}).some((s) => s.id === 'cash_only'));
    assert.ok(
      playableSteps(mercado, { pay: 'cartão' }).some((s) => s.id === 'cash_only'),
    );
  });

  it('start emits character says; resume replays last character line', () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    const state = createRoleplaySessionState({
      id: 's1',
      user_id: 'u1',
      situation_id: 'rp.cafe',
      first_step_id: 'order_drink',
    });
    const started = startRoleplayScene({ situation: cafe, state });
    assert.ok(started.events.some((e) => e.type === 'character'));
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
    const chars = resumed.events.filter((e) => e.type === 'character');
    assert.ok(chars.length >= 1);
    assert.equal(chars[0].tl, 'Bom dia! Diga.');
  });

  it('miss 1 shows hint + chips; miss 2 waits; sending sentence assists', async () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    let state = createRoleplaySessionState({
      id: 's2',
      user_id: 'u1',
      situation_id: 'rp.cafe',
      first_step_id: 'order_drink',
    });
    state = startRoleplayScene({ situation: cafe, state }).state;

    const miss1 = await runRoleplayTurn({
      situation: cafe,
      state,
      learnerText: 'zzzz not portuguese',
    });
    state = miss1.state;
    assert.equal(state.current_step_id, 'order_drink');
    assert.equal(state.pending_assist, null);
    // One character bubble (file re-ask) — no Desculpe? ladder.
    const chars1 = miss1.events.filter((e) => e.type === 'character');
    assert.equal(chars1.length, 1);
    assert.ok(!chars1.some((e) => e.tl === 'Desculpe?'));
    assert.ok(miss1.events.some((e) => e.type === 'help' && e.chips.length === 2));
    assert.ok(miss1.events.some((e) => e.type === 'coach' && e.moment === 'hint'));

    const miss2 = await runRoleplayTurn({
      situation: cafe,
      state,
      learnerText: 'zzzz again',
    });
    state = miss2.state;
    assert.equal(state.current_step_id, 'order_drink');
    assert.ok(state.pending_assist);
    assert.ok(
      miss2.events.some(
        (e) => e.type === 'coach' && e.moment === 'assist' && e.chips?.length === 1,
      ),
    );
    assert.ok(!state.assisted_steps.includes('order_drink'));

    const send = await runRoleplayTurn({
      situation: cafe,
      state,
      learnerText: state.pending_assist!,
      assisted: true,
    });
    state = send.state;
    assert.ok(state.assisted_steps.includes('order_drink'));
    assert.notEqual(state.current_step_id, 'order_drink');
    assert.equal(state.pending_assist, null);
    assert.equal(state.model_calls, 0);
  });

  it('miss with null says: one re-ask bubble (no Desculpe?)', async () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    const nullSays = cafe.steps.find((s) => s.says === null);
    assert.ok(nullSays, 'cafe should have a null-says step');
    const idx = cafe.steps.findIndex((s) => s.id === nullSays!.id);
    const prev = cafe.steps[idx - 1];
    assert.ok(prev?.reply);

    let state = createRoleplaySessionState({
      id: 's-null',
      user_id: 'u1',
      situation_id: 'rp.cafe',
      first_step_id: nullSays!.id,
    });
    const reply = pickLine(prev!.reply!, 'm')!;
    state.exchanges.push({
      role: 'character',
      tl: reply.tl,
      ar: reply.ar,
      step_id: prev!.id,
      kind: 'reply',
    });

    const r = await runRoleplayTurn({
      situation: cafe,
      state,
      learnerText: 'zzzz',
    });
    const chars = r.events.filter((e) => e.type === 'character');
    assert.equal(chars.length, 1);
    assert.ok(!chars.some((e) => e.tl === 'Desculpe?'));
    assert.ok(r.events.some((e) => e.type === 'help'));
  });

  it('side channel language question skips the actor', async () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    const state = createRoleplaySessionState({
      id: 's3',
      user_id: 'u1',
      situation_id: 'rp.cafe',
      first_step_id: 'order_drink',
    });
    let actorCalls = 0;
    const { createStubRoleplayActor } = await import('../lib/v2/roleplay/actor');
    const actor = createStubRoleplayActor({
      reply: () => {
        actorCalls += 1;
        return 'Oi!\nAR: مرحبا\nBEAT: open';
      },
    });
    const r = await runRoleplayTurn(
      {
        situation: cafe,
        state,
        learnerText: 'يعني إيه Diga؟',
      },
      { actor },
    );
    assert.equal(actorCalls, 0);
    assert.equal(r.state.model_calls, 0);
    assert.equal(r.state.current_step_id, 'order_drink');
    assert.ok(r.events.some((e) => e.type === 'coach'));
  });

  it('matched turn advances with file fallback when no actor', async () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    const state = createRoleplaySessionState({
      id: 's4',
      user_id: 'u1',
      situation_id: 'rp.cafe',
      first_step_id: 'order_drink',
    });
    const r = await runRoleplayTurn({
      situation: cafe,
      state,
      learnerText: 'Bom dia! Queria um galão, por favor.',
    });
    assert.equal(r.state.slots.drink, 'galão');
    assert.notEqual(r.state.current_step_id, 'order_drink');
    assert.equal(r.state.model_calls, 0);
    const chars = r.events.filter((e) => e.type === 'character');
    assert.equal(chars.length, 1);
  });

  it('stub actor: one bubble, BEAT done sets slot when code did not match', async () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    const state = createRoleplaySessionState({
      id: 's-actor',
      user_id: 'u1',
      situation_id: 'rp.cafe',
      first_step_id: 'order_drink',
    });
    const { createStubRoleplayActor } = await import('../lib/v2/roleplay/actor');
    const actor = createStubRoleplayActor({
      reply:
        'Um café? Claro! Mais alguma coisa?\nAR: قهوة؟ طبعاً!\nBEAT: done café',
    });
    const r = await runRoleplayTurn(
      {
        situation: cafe,
        state,
        learnerText: 'quero um coffee',
      },
      { actor },
    );
    assert.equal(r.state.model_calls, 1);
    assert.equal(r.state.slots.drink, 'café');
    const chars = r.events.filter((e) => e.type === 'character');
    assert.equal(chars.length, 1);
    assert.ok(chars[0].tl.includes('café') || chars[0].tl.includes('Café'));
    assert.ok(!chars[0].tl.includes('BEAT:'));
    assert.ok(!chars[0].tl.includes('AR:'));
  });

  it('applies {name} and drops it with its comma when unknown', () => {
    clearRoleplayLoadCache();
    assert.equal(applyLearnerName('Olá, {name}!', 'Omar'), 'Olá, Omar!');
    assert.equal(applyLearnerName('Olá, {name}!', null), 'Olá!');
    const encomenda = loadRoleplaySituation('rp.encomenda');
    const withName = createRoleplaySessionState({
      id: 's-name',
      user_id: 'u1',
      situation_id: 'rp.encomenda',
      first_step_id: encomenda.steps[0].id,
      learner_name: 'Omar',
    });
    const named = startRoleplayScene({ situation: encomenda, state: withName });
    const namedLine = named.events.find((e) => e.type === 'character');
    assert.ok(namedLine && namedLine.tl.includes('Omar'));
    const without = createRoleplaySessionState({
      id: 's-noname',
      user_id: 'u1',
      situation_id: 'rp.encomenda',
      first_step_id: encomenda.steps[0].id,
      learner_name: null,
    });
    const dropped = startRoleplayScene({ situation: encomenda, state: without });
    const droppedLine = dropped.events.find((e) => e.type === 'character');
    assert.ok(droppedLine);
    assert.equal(droppedLine!.tl.includes('{name}'), false);
    assert.equal(droppedLine!.tl.includes('Omar'), false);
  });

  it('picks _f forms for female learners', () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    const food = cafe.steps.find((s) => s.id === 'order_food')!;
    assert.ok(food.expects.examples_tl_f?.length);
    const fLine = {
      tl: food.expects.examples_tl[1] ?? 'Só isto, obrigado.',
      ar: 'x',
      tl_f: food.expects.examples_tl_f![0],
    };
    assert.equal(pickLine(fLine, 'f')!.tl, food.expects.examples_tl_f![0]);
    assert.notEqual(pickLine(fLine, 'm')!.tl, food.expects.examples_tl_f![0]);
    assert.ok(food.help.chips_f?.some((c) => c.includes('obrigada')));
    assert.ok(food.help.chips.some((c) => c.includes('obrigado')));
  });

  it('emits speaker from cast when the step has a speaker', () => {
    clearRoleplayLoadCache();
    const market = loadRoleplaySituation('rp.supermercado');
    assert.ok(market.cast && market.cast.length >= 2);
    const withSpeaker = market.steps.find((s) => s.speaker);
    assert.ok(withSpeaker?.speaker);
    const state = createRoleplaySessionState({
      id: 's-cast',
      user_id: 'u1',
      situation_id: 'rp.supermercado',
      first_step_id: withSpeaker!.id,
    });
    // Start from that step so the first character event carries speaker.
    const started = startRoleplayScene({ situation: market, state });
    const char = started.events.find((e) => e.type === 'character');
    assert.ok(char);
    assert.equal(char!.speaker, withSpeaker!.speaker);
  });
});
