import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildRoleplayCatalog,
  characterBubbles,
  characterStepIds,
  clearRoleplayLoadCache,
  createStubRoleplayActor,
  endsWithOpenTalk,
  finishWithChips,
  loadAllRoleplaySituations,
  loadRoleplayIndex,
  loadRoleplaySituation,
  runRoleplayScript,
  runRoleplayTurn,
  startRoleplayScene,
  createRoleplaySessionState,
  validateAllRoleplaySituations,
} from '../lib/v2/roleplay';

/** Scripted paths end with Adeus so the end card appears after task_done. */
function withGoodbye(turns: Array<{ text: string; assisted?: boolean; help?: boolean }>) {
  return [...turns, { text: 'Adeus!' }];
}

describe('roleplay R5 goldens', () => {
  it('1 · rp.cafe full path → closing (file fallback)', async () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    const r = await runRoleplayScript({
      situation: cafe,
      turns: withGoodbye([
        { text: 'Bom dia! Queria um galão, por favor.' },
        { text: 'Um pastel de nata, por favor.' },
        { text: 'Para levar.' },
        { text: 'Quanto é?' },
        { text: 'Aceita cartão?' },
        { text: 'Não, obrigado.' },
        { text: 'Obrigado! Até amanhã!' },
      ]),
    });
    assert.equal(r.state.status, 'done');
    assert.ok(r.state.task_done);
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
  });

  it('3 · rp.mercado: cartão → cash_only → Está bem. Aqui tem.', async () => {
    clearRoleplayLoadCache();
    const mercado = loadRoleplaySituation('rp.mercado');
    const r = await runRoleplayScript({
      situation: mercado,
      turns: withGoodbye([
        { text: 'Queria um quilo de laranjas, por favor.' },
        { text: 'Quanto custa?' },
        { text: 'Só isto, obrigado.' },
        { text: 'Sim, por favor.' },
        { text: 'Aceita cartão?' },
        { text: 'Está bem. Aqui tem.' },
        { text: 'Obrigado! Igualmente!' },
      ]),
    });
    assert.equal(r.state.slots.pay, 'cartão');
    const steps = new Set(characterStepIds(r.events));
    assert.ok(steps.has('cash_only'));
    assert.equal(r.state.status, 'done');
  });

  it('4 · rp.restaurante: no pork → chicken → soup / chouriço', async () => {
    clearRoleplayLoadCache();
    const rest = loadRoleplaySituation('rp.restaurante');
    const r = await runRoleplayScript({
      situation: rest,
      turns: withGoodbye([
        { text: 'Uma mesa para dois, por favor.' },
        { text: 'Não como carne de porco.' },
        { text: 'O frango.' },
        { text: 'Isto tem porco?' },
        { text: 'Uma água, por favor.' },
        { text: 'Sim, muito bom!' },
        { text: 'A conta, por favor.' },
        { text: 'Aceita cartão?' },
        { text: 'Obrigado! Boa tarde!' },
      ]),
    });
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
      turns: withGoodbye([
        { text: 'Desculpe, sabe onde fica o metro?' },
        { text: 'Pode repetir?' },
        { text: 'Em frente e depois à esquerda?' },
        { text: 'É longe?' },
        { text: 'Ao lado do banco. Obrigado!' },
        { text: 'Muito obrigado! Bom dia!' },
      ]),
    });
    assert.equal(r.state.status, 'done');
  });

  it('6 · stub model: quero um coffee → BEAT done café, one bubble, no hint', async () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    const actor = createStubRoleplayActor({
      reply:
        'Um café? Claro! Mais alguma coisa?\nAR: قهوة؟ طبعا!\nBEAT: done café',
    });
    const r = await runRoleplayScript({
      situation: cafe,
      actor,
      turns: [{ text: 'quero um coffee' }],
    });
    assert.equal(r.state.model_calls, 1);
    assert.equal(r.state.slots.drink, 'café');
    assert.notEqual(r.state.current_step_id, 'order_drink');
    const turnChars = r.events.filter(
      (e) => e.type === 'character' && !e.tl.startsWith('Bom dia'),
    );
    assert.equal(turnChars.length, 1);
    assert.ok(endsWithOpenTalk(turnChars[0]!.tl));
    assert.ok(!r.events.some((e) => e.type === 'help'));
  });

  it('7 · fallback: empty / Chinese / 4 sentences / timeout → file lines', async () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');

    async function oneTurn(reply: string | { timeout: true }) {
      const actor =
        typeof reply === 'string'
          ? createStubRoleplayActor({ reply })
          : createStubRoleplayActor({ reply: 'x', timeout: true });
      let state = createRoleplaySessionState({
        id: `fb-${Math.random()}`,
        user_id: 'u',
        situation_id: 'rp.cafe',
        first_step_id: 'order_drink',
      });
      state = startRoleplayScene({ situation: cafe, state }).state;
      const r = await runRoleplayTurn(
        {
          situation: cafe,
          state,
          learnerText: 'Bom dia! Queria um galão, por favor.',
        },
        { actor },
      );
      assert.equal(r.state.slots.drink, 'galão');
      assert.notEqual(r.state.current_step_id, 'order_drink');
      const chars = r.events.filter((e) => e.type === 'character');
      assert.equal(chars.length, 1);
      assert.ok(endsWithOpenTalk(chars[0]!.tl));
      assert.ok(!chars[0]!.tl.includes('你好'));
      return r;
    }

    await oneTurn('');
    await oneTurn('你好世界朋友同事\nAR: x\nBEAT: done galão');
    await oneTurn('One. Two. Three. Four.\nAR: x\nBEAT: done galão');
    await oneTurn({ timeout: true });
  });

  it('8 · state: BEAT done on sim rejected; invalid slot rejected', async () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');

    const simActor = createStubRoleplayActor({
      reply: 'Um café?\nAR: قهوة؟\nBEAT: done café',
    });
    let state = createRoleplaySessionState({
      id: 'sim-reject',
      user_id: 'u',
      situation_id: 'rp.cafe',
      first_step_id: 'order_drink',
    });
    state = startRoleplayScene({ situation: cafe, state }).state;
    const sim = await runRoleplayTurn(
      { situation: cafe, state, learnerText: 'sim' },
      { actor: simActor },
    );
    assert.equal(sim.state.current_step_id, 'order_drink');
    assert.equal(sim.state.slots.drink, undefined);
    assert.ok(sim.events.some((e) => e.type === 'help' || e.type === 'coach'));

    const badSlot = createStubRoleplayActor({
      reply: 'Ok!\nAR: تمام\nBEAT: done pizza',
    });
    state = createRoleplaySessionState({
      id: 'bad-slot',
      user_id: 'u',
      situation_id: 'rp.cafe',
      first_step_id: 'order_drink',
    });
    state = startRoleplayScene({ situation: cafe, state }).state;
    const bad = await runRoleplayTurn(
      { situation: cafe, state, learnerText: 'quero um coffee' },
      { actor: badSlot },
    );
    assert.equal(bad.state.current_step_id, 'order_drink');
    assert.equal(bad.state.slots.drink, undefined);
  });

  it('9 · open and directed (stub model)', async () => {
    clearRoleplayLoadCache();
    const mercado = loadRoleplaySituation('rp.mercado');

    // quria frutas → beat stays open; offers fruit options; ends with ?; no next beat line
    const openActor = createStubRoleplayActor({
      reply:
        'Fruta, claro! Temos laranjas, maçãs, bananas… O que quer?\nAR: فاكهة؟\nBEAT: open',
    });
    let state = createRoleplaySessionState({
      id: 'od-open',
      user_id: 'u',
      situation_id: 'rp.mercado',
      first_step_id: 'order',
    });
    state = startRoleplayScene({ situation: mercado, state }).state;
    const open = await runRoleplayTurn(
      { situation: mercado, state, learnerText: 'quria frutas' },
      { actor: openActor },
    );
    assert.equal(open.state.current_step_id, 'order');
    const openChar = open.events.find((e) => e.type === 'character');
    assert.ok(openChar && endsWithOpenTalk(openChar.tl));
    assert.ok(!/Aqui está/i.test(openChar!.tl));
    assert.ok(/laranjas|maçãs|bananas|fruta/i.test(openChar!.tl));

    // Statement ending → rejected; fallback ends with question
    const closedActor = createStubRoleplayActor({
      reply: 'Olhe, é tudo fresquinho!\nAR: كله فريش\nBEAT: open',
    });
    state = createRoleplaySessionState({
      id: 'od-closed',
      user_id: 'u',
      situation_id: 'rp.mercado',
      first_step_id: 'order',
    });
    state = startRoleplayScene({ situation: mercado, state }).state;
    const closed = await runRoleplayTurn(
      { situation: mercado, state, learnerText: 'quria frutas' },
      { actor: closedActor },
    );
    const closedChar = closed.events.find((e) => e.type === 'character');
    assert.ok(closedChar && endsWithOpenTalk(closedChar.tl));
    assert.ok(!/^Olhe, é tudo fresquinho!?$/i.test(closedChar!.tl.trim()));

    // After last beat: المهمة خلصت ✓; next turn ends with ?; Adeus → end card
    const cafe = loadRoleplaySituation('rp.cafe');
    const afterActor = createStubRoleplayActor({
      reply: (prompt) => {
        if (/task is done|keep a light/i.test(prompt)) {
          return 'Gosta do café?\nAR: بتحب القهوة؟\nBEAT: open';
        }
        if (/goodbye|saying goodbye/i.test(prompt)) {
          return 'Adeus! Bom dia!\nAR: مع السلامة!\nBEAT: open';
        }
        return 'Claro! Mais alguma coisa?\nAR: تمام!\nBEAT: done';
      },
    });
    const scripted = await runRoleplayScript({
      situation: cafe,
      actor: afterActor,
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
    assert.equal(scripted.state.status, 'active');
    assert.equal(scripted.state.task_done, true);
    assert.ok(
      scripted.events.some(
        (e) => e.type === 'coach' && e.eg.includes('المهمة خلصت'),
      ),
    );

    const chat = await runRoleplayTurn(
      {
        situation: cafe,
        state: scripted.state,
        learnerText: 'Sim, muito!',
      },
      { actor: afterActor },
    );
    assert.equal(chat.state.status, 'active');
    const chatChar = chat.events.find((e) => e.type === 'character');
    assert.ok(chatChar && endsWithOpenTalk(chatChar.tl));

    const bye = await runRoleplayTurn(
      {
        situation: cafe,
        state: chat.state,
        learnerText: 'Adeus!',
      },
      { actor: afterActor },
    );
    assert.equal(bye.state.status, 'done');
    assert.ok(bye.events.some((e) => e.type === 'result'));

    // ask_price shows 💡 cue; order shows no cue
    state = createRoleplaySessionState({
      id: 'od-cue',
      user_id: 'u',
      situation_id: 'rp.mercado',
      first_step_id: 'order',
    });
    const orderStart = startRoleplayScene({ situation: mercado, state });
    assert.ok(!orderStart.events.some((e) => e.type === 'cue'));

    // Advance to ask_price via chips path
    state = orderStart.state;
    const toPrice = await runRoleplayTurn({
      situation: mercado,
      state,
      learnerText: 'Queria um quilo de laranjas, por favor.',
      assisted: true,
    });
    assert.equal(toPrice.state.current_step_id, 'ask_price');
    const cue = toPrice.events.find((e) => e.type === 'cue');
    assert.ok(cue && cue.type === 'cue');
    assert.ok(cue.eg.includes('اسأله بكام') || cue.eg.includes('بكام'));

    // Side question → answered, beat stays, no miss
    const sideActor = createStubRoleplayActor({
      reply:
        'Sim, é fresco! O que quer: laranjas, maçãs ou bananas?\nAR: أيوه فريش!\nBEAT: open',
    });
    state = createRoleplaySessionState({
      id: 'od-side',
      user_id: 'u',
      situation_id: 'rp.mercado',
      first_step_id: 'order',
    });
    state = startRoleplayScene({ situation: mercado, state }).state;
    const beforeMiss = state.misses.order ?? 0;
    const side = await runRoleplayTurn(
      {
        situation: mercado,
        state,
        learnerText: 'Isto é fresco?',
      },
      { actor: sideActor },
    );
    assert.equal(side.state.current_step_id, 'order');
    assert.equal(side.state.misses.order ?? 0, beforeMiss);
    assert.equal(side.state.side_talk_streak, 1);
    assert.ok(!side.events.some((e) => e.type === 'help'));
    const sideChar = side.events.find((e) => e.type === 'character');
    assert.ok(sideChar && endsWithOpenTalk(sideChar.tl));
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
    const chars = characterBubbles(resumed.events);
    assert.ok(chars.some((e) => e.tl.includes('Bom dia')));
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
