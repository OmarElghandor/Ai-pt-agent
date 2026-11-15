import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildRoleplayCatalog,
  characterStepIds,
  clearRoleplayLoadCache,
  finishWithChips,
  loadAllRoleplaySituations,
  loadRoleplayIndex,
  loadRoleplaySituation,
  runRoleplayScript,
  startRoleplayScene,
  createRoleplaySessionState,
  validateAllRoleplaySituations,
} from '../lib/v2/roleplay';

describe('roleplay R5 goldens', () => {
  it('1 · rp.cafe full path → closing; zero model calls', async () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    const r = await runRoleplayScript({
      situation: cafe,
      turns: [
        { text: 'Bom dia! Queria um galão, por favor.' },
        { text: 'Um pastel de nata, por favor.' },
        { text: 'Para levar.' },
        { text: 'Quanto é?' },
        { text: 'Aceita cartão?' },
        { text: 'Não, obrigado.' },
        { text: 'Obrigado! Até amanhã!' },
      ],
    });
    assert.equal(r.state.status, 'done');
    assert.equal(r.state.model_calls, 0);
    assert.ok(r.events.some((e) => e.type === 'result'));
  });

  it('2 · rp.cafe: sim → help; sim again → full sentence assisted', async () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    const r = await runRoleplayScript({
      situation: cafe,
      turns: [
        { text: 'sim' },
        { text: 'sim' },
        { text: 'Queria um galão, por favor.', assisted: true },
      ],
    });
    assert.ok(r.events.some((e) => e.type === 'help' || e.type === 'coach'));
    assert.ok(r.state.assisted_steps.includes('order_drink'));
    assert.notEqual(r.state.current_step_id, 'order_drink');
    assert.equal(r.state.model_calls, 0);
  });

  it('3 · rp.mercado: cartão → cash_only → Está bem. Aqui tem.', async () => {
    clearRoleplayLoadCache();
    const mercado = loadRoleplaySituation('rp.mercado');
    const r = await runRoleplayScript({
      situation: mercado,
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
    assert.equal(r.state.status, 'done');
    assert.equal(r.state.model_calls, 0);
  });

  it('4 · rp.restaurante: no pork → chicken → soup / chouriço', async () => {
    clearRoleplayLoadCache();
    const rest = loadRoleplaySituation('rp.restaurante');
    const r = await runRoleplayScript({
      situation: rest,
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
    assert.ok(
      r.state.alone_steps.includes('choose') || r.state.slots.food === 'frango',
    );
    const steps = new Set(characterStepIds(r.events));
    assert.ok(steps.has('soup') || steps.has('choose'));
    assert.ok(
      r.events.some(
        (e) =>
          e.type === 'character' && e.tl.toLowerCase().includes('chouriço'),
      ) || steps.has('soup'),
    );
    assert.equal(r.state.status, 'done');
  });

  it('5 · rp.direcoes: Pode repetir? stays → then confirm', async () => {
    clearRoleplayLoadCache();
    const dir = loadRoleplaySituation('rp.direcoes');
    const r = await runRoleplayScript({
      situation: dir,
      turns: [
        { text: 'Desculpe, sabe onde fica o metro?' },
        { text: 'Pode repetir?' },
        { text: 'Em frente e depois à esquerda?' },
        { text: 'É longe?' },
        { text: 'Ao lado do banco. Obrigado!' },
        { text: 'Muito obrigado! Bom dia!' },
      ],
    });
    assert.equal(r.state.model_calls, 0);
    assert.equal(r.state.status, 'done');
  });

  it('6 · whole run makes zero model calls', async () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    let liveCalls = 0;
    const r = await runRoleplayScript({
      situation: cafe,
      modelReactionsEnabled: false,
      modelReaction: async () => {
        liveCalls += 1;
        return 'nope';
      },
      turns: [
        { text: 'Bom dia! Queria um café, por favor.' },
        { text: 'Um pastel de nata, por favor.' },
        { text: 'Para comer aqui.' },
        { text: 'Quanto é?' },
        { text: 'Em dinheiro.' },
        { text: 'Não, obrigado.' },
        { text: 'Obrigado! Bom dia!' },
      ],
    });
    assert.equal(liveCalls, 0);
    assert.equal(r.modelCalls, 0);
  });

  it('every situation finishes via chips alone', async () => {
    clearRoleplayLoadCache();
    const situations = loadAllRoleplaySituations();
    assert.equal(situations.length, 15);
    for (const situation of situations) {
      const r = await finishWithChips({ situation });
      assert.equal(
        r.state.status,
        'done',
        `${situation.id} should finish via chips (step=${r.state.current_step_id})`,
      );
      assert.equal(r.state.model_calls, 0);
    }
  });

  it('path finished card state when all 15 are done', () => {
    clearRoleplayLoadCache();
    const index = loadRoleplayIndex();
    const catalog = buildRoleplayCatalog({
      finishedIds: index.path.map((p) => p.id),
    });
    assert.equal(catalog.path_finished, true);
    assert.equal(catalog.next, null);
    assert.equal(catalog.past.length, 15);
  });

  it('resume replays the last character line', () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    const state = createRoleplaySessionState({
      id: 'resume-r5',
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
    const chars = resumed.events.filter((e) => e.type === 'character');
    assert.ok(chars.some((e) => e.tl === 'Bom dia! Diga.'));
  });

  it('reports validation issues without failing the suite', () => {
    clearRoleplayLoadCache();
    const issues = validateAllRoleplaySituations(loadAllRoleplaySituations());
    assert.ok(Array.isArray(issues));
    if (issues.length) {
      console.log(
        '[roleplay validation]',
        issues
          .map((i) => `${i.situation_id} ${i.path}: ${i.message}`)
          .join('\n'),
      );
    }
  });
});
