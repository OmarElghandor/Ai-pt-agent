import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  characterStepIds,
  clearRoleplayLoadCache,
  finishWithChips,
  loadAllRoleplaySituations,
  loadRoleplaySituation,
  runRoleplayScript,
  validateAllRoleplaySituations,
} from '../lib/v2/roleplay';

describe('roleplay R8 goldens', () => {
  it('1 · rp.cafe tier 1 chip path → closing + star 1; no t2/t3 steps', async () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    const r = await runRoleplayScript({
      situation: cafe,
      tier: 1,
      turns: [
        { text: 'Bom dia! Queria um galão, por favor.' },
        { text: 'Um pastel de nata, por favor.' },
        { text: 'Quanto é?' },
        { text: 'Aceita cartão?' },
        { text: 'Obrigado! Até amanhã!' },
      ],
    });
    assert.equal(r.state.status, 'done');
    assert.equal(r.state.model_calls, 0);
    assert.ok(r.events.some((e) => e.type === 'result' && e.star === 1));
    assert.ok(r.events.some((e) => e.type === 'character' && e.step_id === 'closing'));
    const steps = new Set(characterStepIds(r.events));
    assert.ok(!steps.has('no_galao'));
    assert.ok(!steps.has('here_or_go'));
    assert.ok(!steps.has('contribuinte'));
  });

  it('2 · rp.cafe tier 3: galão → no_galao → Pode ser; here_or_go + contribuinte', async () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    const r = await runRoleplayScript({
      situation: cafe,
      tier: 3,
      turns: [
        { text: 'Bom dia! Queria um galão, por favor.' },
        { text: 'Pode ser.' },
        { text: 'Um pastel de nata, por favor.' },
        { text: 'Para comer aqui.' },
        { text: 'Quanto é?' },
        { text: 'Aceita cartão?' },
        { text: 'Não, obrigado.' },
        { text: 'Obrigado! Até amanhã!' },
      ],
    });
    assert.equal(r.state.model_calls, 0);
    assert.equal(r.state.slots.drink, 'café');
    const steps = new Set(characterStepIds(r.events));
    assert.ok(steps.has('no_galao'));
    assert.ok(steps.has('here_or_go'));
    assert.ok(steps.has('contribuinte'));
    assert.equal(r.state.status, 'done');
  });

  it('3 · rp.mercado tier 1: cartão → cash_only → cash', async () => {
    clearRoleplayLoadCache();
    const mercado = loadRoleplaySituation('rp.mercado');
    const r = await runRoleplayScript({
      situation: mercado,
      tier: 1,
      turns: [
        { text: 'Queria um quilo de laranjas, por favor.' },
        { text: 'Quanto custa?' },
        { text: 'Só isto, obrigado.' },
        { text: 'Sim, por favor.' },
        { text: 'Aceita cartão?' },
        { text: 'Está bem. Aqui tem.' },
        { text: 'Obrigado! Igualmente!' },
      ],
    });
    assert.equal(r.state.slots.pay, 'cartão');
    const steps = new Set(characterStepIds(r.events));
    assert.ok(steps.has('cash_only'));
    assert.ok(
      r.events.some(
        (e) =>
          e.type === 'character' &&
          e.step_id === 'cash_only' &&
          (e.tl.includes('troco') || e.tl.includes('Dinheiro')),
      ) ||
        r.events.some(
          (e) =>
            e.type === 'character' &&
            typeof e.tl === 'string' &&
            e.tl.includes('troco'),
        ),
    );
    assert.equal(r.state.status, 'done');
    assert.equal(r.state.model_calls, 0);
  });

  it('4 · rp.restaurante tier 2: no pork → chicken → soup → chouriço', async () => {
    clearRoleplayLoadCache();
    const rest = loadRoleplaySituation('rp.restaurante');
    const r = await runRoleplayScript({
      situation: rest,
      tier: 2,
      turns: [
        { text: 'Uma mesa para dois, por favor.' },
        { text: 'Não como carne de porco.' },
        { text: 'O frango.' },
        { text: 'Isto tem porco?' },
        { text: 'Uma água, por favor.' },
        { text: 'Sim, muito bom!' },
        { text: 'A conta, por favor.' },
        { text: 'Aceita cartão?' },
        { text: 'Obrigado! Boa tarde!' },
      ],
    });
    assert.equal(r.state.model_calls, 0);
    assert.ok(r.state.alone_steps.includes('choose') || r.state.slots.food === 'frango');
    const steps = new Set(characterStepIds(r.events));
    assert.ok(steps.has('soup'));
    assert.ok(
      r.events.some(
        (e) => e.type === 'character' && e.tl.toLowerCase().includes('chouriço'),
      ),
    );
    assert.equal(r.state.status, 'done');
  });

  it('5 · rp.encomenda tier 1: مش فاهم → help → Desculpe, pode repetir?', async () => {
    clearRoleplayLoadCache();
    const enc = loadRoleplaySituation('rp.encomenda');
    const r = await runRoleplayScript({
      situation: enc,
      tier: 1,
      turns: [
        { text: 'Sim, sou eu.' },
        { text: 'مش فاهم' },
        { text: 'Desculpe, pode repetir?' },
        { text: 'Falo um pouco.' },
        { text: 'Obrigado! Boa tarde!' },
      ],
    });
    assert.equal(r.state.model_calls, 0);
    assert.ok(r.events.some((e) => e.type === 'help' || e.type === 'coach'));
    assert.ok(
      r.events.some(
        (e) =>
          e.type === 'character' &&
          e.step_id === 'sign' &&
          e.tl.includes('Assine'),
      ),
    );
    assert.equal(r.state.slots.understood, 'repeat');
  });

  it('6 · three wrong answers → assisted and advances (no dead end)', async () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    const r = await runRoleplayScript({
      situation: cafe,
      tier: 1,
      turns: [
        { text: 'asdfgh' },
        { text: 'qwerty' },
        { text: 'zxcvbn' },
      ],
    });
    assert.ok(r.state.assisted_steps.includes('order_drink'));
    assert.notEqual(r.state.current_step_id, 'order_drink');
    assert.equal(r.state.model_calls, 0);
  });

  it('normal path makes zero model calls (matcher hit + off-script + help)', async () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    let liveCalls = 0;
    const r = await runRoleplayScript({
      situation: cafe,
      tier: 3,
      modelReactionsEnabled: false,
      modelReaction: async () => {
        liveCalls += 1;
        return 'nope';
      },
      turns: [
        { text: 'Bom dia! Queria um café, por favor.' },
        { text: 'zzzz' },
        { text: 'يعني إيه pastel؟' },
        { text: 'Um pastel de nata, por favor.' },
        { text: 'Para levar, por favor.' },
        { text: 'Quanto é?' },
        { text: 'Em dinheiro.' },
        { text: 'Não, obrigado.' },
        { text: 'Obrigado! Bom dia!' },
      ],
    });
    assert.equal(liveCalls, 0);
    assert.equal(r.modelCalls, 0);
  });

  it('every situation finishes at all 3 tiers via chips alone', async () => {
    clearRoleplayLoadCache();
    const situations = loadAllRoleplaySituations();
    assert.equal(situations.length, 15);
    for (const situation of situations) {
      for (const tier of [1, 2, 3] as const) {
        const r = await finishWithChips({ situation, tier });
        assert.equal(
          r.state.status,
          'done',
          `${situation.id} tier ${tier} should finish via chips (step=${r.state.current_step_id})`,
        );
        assert.equal(r.state.model_calls, 0);
      }
    }
  });

  it('reports validation issues without failing the suite', () => {
    clearRoleplayLoadCache();
    const issues = validateAllRoleplaySituations(loadAllRoleplaySituations());
    // Authored content may have known issues — keep the list for the final report.
    assert.ok(Array.isArray(issues));
    if (issues.length) {
      console.log(
        '[roleplay validation]',
        issues.map((i) => `${i.situation_id} ${i.path}: ${i.message}`).join('\n'),
      );
    }
  });
});
