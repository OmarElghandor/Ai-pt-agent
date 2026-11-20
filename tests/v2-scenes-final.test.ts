/**
 * FINAL SPEC §6–§8 acceptance tests T1–T22 (stub model where noted).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MemoryConvoSessionStore,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';
import {
  createStubConvoStreamModel,
  runFreeConvoTurn,
  type ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn';
import { loadAllSceneBanks, loadSceneBank } from '@/lib/v2/convo/scenes';
import { getCharacter } from '@/lib/v2/characters/registry';
import { gradeFreeText, type FreeTextCorrection } from '@/lib/v2/grader';

const stubGrader = async (): Promise<FreeTextCorrection> => ({
  has_error: false,
  severity: 'none',
  corrected_tl: '',
  changes: [],
  main_error: null,
  note_eg: '',
  ar: '',
});

async function startCafe(userId: string) {
  const store = new MemoryConvoSessionStore();
  const started = await startFreeConvoSession({
    userId,
    topicId: 'cena-cafe',
    store,
    learnerName: null,
    learnerLevel: 9,
    newId: () => `${userId}-sess`,
  });
  return { store, started };
}

function characterPts(events: ConvoTurnStreamEvent[]): string[] {
  return events
    .filter(
      (e): e is Extract<ConvoTurnStreamEvent, { type: 'bubble_ar' }> =>
        e.type === 'bubble_ar',
    )
    .map((e) => e.pt);
}

function lastCharacterPt(events: ConvoTurnStreamEvent[]): string {
  const pts = characterPts(events);
  return pts[pts.length - 1] ?? '';
}

function hintEvents(events: ConvoTurnStreamEvent[]) {
  return {
    coach: events.filter((e) => e.type === 'coach' && e.moment === 'help'),
    frames: events.filter((e) => e.type === 'free_frame'),
  };
}

function stubModel(pt: string, goal = 'none', ar = 'حسناً.') {
  return createStubConvoStreamModel({
    byCandidate: () => `PT: ${pt}\nAR: ${ar}\nGOAL: ${goal}`,
  });
}

async function turn(
  store: MemoryConvoSessionStore,
  session: Awaited<ReturnType<typeof startCafe>>['started']['session'],
  text: string,
  opts?: {
    stub?: { pt: string; ar?: string; goal?: string };
    grader?: typeof stubGrader;
    gender?: 'm' | 'f';
  },
) {
  const events: ConvoTurnStreamEvent[] = [];
  const out = await runFreeConvoTurn({
    session,
    learnerText: text,
    store,
    model: stubModel(opts?.stub?.pt ?? '', opts?.stub?.goal ?? 'none', opts?.stub?.ar),
    emit: (e) => events.push(e),
    freeTextGrader: opts?.grader ?? stubGrader,
    learnerGender: opts?.gender,
    stubSceneReaction: opts?.stub,
  });
  return { out, events };
}

function markDone(
  session: Awaited<ReturnType<typeof startCafe>>['started']['session'],
  ids: string[],
) {
  session.goals = session.goals.map((g) =>
    ids.includes(g.id) ? { ...g, status: 'done' as const } : g,
  );
  const open = session.goals.find((g) => g.status === 'open');
  session.current_goal = open?.id ?? null;
}

describe.skip('scenes FINAL SPEC §6–§8 T1–T22', () => {
  it('T1 · start opening «Bom dia! Diga.» · current = order_drink', async () => {
    const { started } = await startCafe('t1');
    assert.equal(started.resumed, false);
    assert.equal(started.opening.character.tl, 'Bom dia! Diga.');
    assert.equal(started.session.current_goal, 'cafe.order_drink');
  });

  it('T2 · quero um cafe + R → reaction + Mais alguma coisa?', async () => {
    const { store, started } = await startCafe('t2');
    const { out, events } = await turn(store, started.session, 'quero um cafe', {
      stub: { pt: 'Um café? Claro! 😊', goal: 'cafe.order_drink' },
    });
    assert.equal(
      out.session.goals.find((g) => g.id === 'cafe.order_drink')?.status,
      'done',
    );
    assert.equal(lastCharacterPt(events), 'Um café? Claro! 😊 Mais alguma coisa?');
  });

  it('T3 · sim → Desculpe? Bom dia! Diga. · misses 1, no hint', async () => {
    const { store, started } = await startCafe('t3');
    const { out, events } = await turn(store, started.session, 'sim', {
      stub: { pt: 'Claro.', goal: 'none' },
    });
    assert.equal(lastCharacterPt(events), 'Desculpe? Bom dia! Diga.');
    assert.equal(out.session.scene_misses, 1);
    assert.equal(hintEvents(events).frames.length, 0);
  });

  it('T4 · after T3, sim again → same bubble + hint L1', async () => {
    const { store, started } = await startCafe('t4');
    const t3 = await turn(store, started.session, 'sim', {
      stub: { pt: 'Claro.', goal: 'none' },
    });
    const { out, events } = await turn(store, t3.out.session, 'sim', {
      stub: { pt: 'Claro.', goal: 'none' },
    });
    assert.equal(lastCharacterPt(events), 'Desculpe? Bom dia! Diga.');
    assert.equal(out.session.scene_misses, 2);
    const hints = hintEvents(events);
    assert.ok(hints.frames.length >= 1);
    const frame = hints.frames[0]!;
    assert.equal(frame.type, 'free_frame');
    if (frame.type === 'free_frame') {
      assert.ok(frame.eg.length > 0);
      assert.equal(frame.chips.length, 2);
    }
  });

  it('T5 · مش عارف → no character bubble; hint L1', async () => {
    const { store, started } = await startCafe('t5');
    const { events } = await turn(store, started.session, 'مش عارف');
    assert.equal(characterPts(events).length, 0);
    const hints = hintEvents(events);
    assert.ok(hints.frames.length >= 1);
    const frame = hints.frames[0]!;
    if (frame.type === 'free_frame') {
      assert.equal(frame.chips.length, 2);
    }
  });

  it('T6 · at order_food «Quanto é?» → skip + pay ask', async () => {
    const { store, started } = await startCafe('t6');
    markDone(started.session, ['cafe.order_drink']);
    started.session.current_goal = 'cafe.order_food';
    await store.save(started.session);
    const { out, events } = await turn(store, started.session, 'Quanto é?', {
      stub: { pt: 'Claro.', goal: 'none' },
    });
    const pt = lastCharacterPt(events);
    assert.match(pt, /dois euros e sessenta/i);
    assert.match(pt, /Cartão ou dinheiro\?\s*$/);
    assert.equal(
      out.session.goals.find((g) => g.id === 'cafe.ask_price')?.status,
      'done',
    );
    assert.equal(
      out.session.goals.find((g) => g.id === 'cafe.order_food')?.status,
      'skipped',
    );
    assert.equal(
      out.session.goals.find((g) => g.id === 'cafe.here_or_go')?.status,
      'skipped',
    );
  });

  it('T7 · at order_food «Obrigado!» → Desculpe? Mais alguma coisa?', async () => {
    const { store, started } = await startCafe('t7');
    markDone(started.session, ['cafe.order_drink']);
    started.session.current_goal = 'cafe.order_food';
    await store.save(started.session);
    const { out, events } = await turn(store, started.session, 'Obrigado!', {
      stub: { pt: 'Claro.', goal: 'none' },
    });
    assert.equal(lastCharacterPt(events), 'Desculpe? Mais alguma coisa?');
    assert.notEqual(out.session.status, 'done');
  });

  it('T8 · SIDE wifi → Isso não sei + current ask; no miss', async () => {
    const { store, started } = await startCafe('t8');
    markDone(started.session, ['cafe.order_drink']);
    started.session.current_goal = 'cafe.order_food';
    await store.save(started.session);
    const { out, events } = await turn(store, started.session, 'Tem wifi?', {
      stub: {
        pt: 'Isso não sei, desculpe.',
        goal: 'side',
      },
    });
    assert.equal(
      lastCharacterPt(events),
      'Isso não sei, desculpe. Mais alguma coisa?',
    );
    assert.equal(out.session.scene_misses ?? 0, 0);
    assert.equal(
      out.session.goals.find((g) => g.id === 'cafe.order_food')?.status,
      'open',
    );
  });

  it('T8b · galão + pastel → here_or_go ask; both drinks/food done', async () => {
    const { store, started } = await startCafe('t8b');
    const { out, events } = await turn(
      store,
      started.session,
      'Um galão e um pastel de nata',
      { stub: { pt: 'Perfeito.', goal: 'none' } },
    );
    assert.match(
      lastCharacterPt(events),
      /É para comer aqui ou para levar\?/,
    );
    assert.equal(
      out.session.goals.find((g) => g.id === 'cafe.order_drink')?.status,
      'done',
    );
    assert.equal(
      out.session.goals.find((g) => g.id === 'cafe.order_food')?.status,
      'done',
    );
  });

  it('T9 · at pay «Pode repetir?» → last character text, rate 0.85', async () => {
    const { store, started } = await startCafe('t9');
    markDone(started.session, [
      'cafe.order_drink',
      'cafe.order_food',
      'cafe.here_or_go',
      'cafe.ask_price',
    ]);
    started.session.current_goal = 'cafe.pay';
    started.session.last_exchanges = [
      {
        role: 'character',
        tl: 'São dois euros e sessenta. Cartão ou dinheiro?',
      },
    ];
    await store.save(started.session);
    const { out, events } = await turn(store, started.session, 'Pode repetir?');
    assert.equal(
      lastCharacterPt(events),
      'São dois euros e sessenta. Cartão ou dinheiro?',
    );
    const bubble = events.find((e) => e.type === 'bubble_ar');
    assert.ok(bubble && bubble.type === 'bubble_ar');
    if (bubble && bubble.type === 'bubble_ar') {
      assert.equal(bubble.playback, 'slow');
    }
    assert.equal(out.session.current_goal, 'cafe.pay');
  });

  it('T10 · contribuinte «Nao perciso» → bye ask', async () => {
    const { store, started } = await startCafe('t10');
    markDone(started.session, [
      'cafe.order_drink',
      'cafe.order_food',
      'cafe.here_or_go',
      'cafe.ask_price',
      'cafe.pay',
    ]);
    started.session.current_goal = 'cafe.contribuinte';
    await store.save(started.session);
    const { out, events } = await turn(store, started.session, 'Nao perciso', {
      stub: { pt: 'Não precisa, muito bem.', goal: 'cafe.contribuinte' },
    });
    assert.equal(
      lastCharacterPt(events),
      'Não precisa, muito bem. Obrigado! Bom dia!',
    );
    assert.equal(
      out.session.goals.find((g) => g.id === 'cafe.contribuinte')?.status,
      'done',
    );
    assert.equal(out.session.current_goal, 'cafe.bye');
  });

  it('T11 · bye «Obrigado!» → closing + end card', async () => {
    const { store, started } = await startCafe('t11');
    markDone(started.session, [
      'cafe.order_drink',
      'cafe.order_food',
      'cafe.here_or_go',
      'cafe.ask_price',
      'cafe.pay',
      'cafe.contribuinte',
    ]);
    started.session.current_goal = 'cafe.bye';
    await store.save(started.session);
    const { out, events } = await turn(store, started.session, 'Obrigado!', {
      stub: { pt: 'Até logo.', goal: 'cafe.bye' },
    });
    assert.equal(lastCharacterPt(events), 'Até amanhã! 👋');
    assert.ok(events.some((e) => e.type === 'coach' && e.id === 'scene_done'));
    assert.equal(out.session.status, 'done');
  });

  it('T12 · echo reaction dropped', async () => {
    const { store, started } = await startCafe('t12');
    const { events } = await turn(store, started.session, 'quero um cafe', {
      stub: {
        pt: 'Claro, o senhor quer um café e um pastel',
        goal: 'cafe.order_drink',
      },
    });
    const pt = lastCharacterPt(events);
    assert.equal(pt, 'Mais alguma coisa?');
    assert.ok(!/senhor quer um café/i.test(pt));
  });

  it('T13 · reaction ending ? or invented number dropped', async () => {
    const { store, started } = await startCafe('t13a');
    const a = await turn(store, started.session, 'quero um cafe', {
      stub: {
        pt: 'Quer mais alguma coisa?',
        goal: 'cafe.order_drink',
      },
    });
    assert.equal(lastCharacterPt(a.events), 'Mais alguma coisa?');

    const { store: store2, started: s2 } = await startCafe('t13b');
    const b = await turn(store2, s2.session, 'quero um cafe', {
      stub: {
        pt: 'São 2 euros, claro',
        goal: 'cafe.order_drink',
      },
    });
    assert.equal(lastCharacterPt(b.events), 'Mais alguma coisa?');
  });

  it('T14 · real grader corrections', async () => {
    const cases: Array<{ in: string; out: RegExp }> = [
      { in: 'Con cartão', out: /Com cartão/i },
      { in: 'Nao perciso', out: /Não preciso/i },
      { in: 'nao como porco', out: /Não como carne de porco/i },
      { in: 'agua', out: /água/i },
    ];
    for (const c of cases) {
      const corr = await gradeFreeText({
        answer: c.in,
        character_tl: 'Cartão ou dinheiro?',
        frame_chips: [
          'Com cartão',
          'Não preciso',
          'Não como carne de porco',
          'água',
        ],
        level: 'A1',
      });
      assert.ok(corr.has_error, `expected correction for ${c.in}`);
      assert.match(corr.corrected_tl, c.out);
    }
  });

  it('T15 · direcoes confirm «pode repetir?» keeps confirm', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 't15',
      topicId: 'cena-direcoes',
      store,
      learnerName: null,
      learnerLevel: 9,
      newId: () => 't15-sess',
    });
    const bank = loadSceneBank('cena-direcoes');
    const confirm = bank.goals.find((g) => g.id.includes('confirm'));
    assert.ok(confirm);
    const before = bank.goals
      .slice(
        0,
        bank.goals.findIndex((g) => g.id === confirm!.id),
      )
      .map((g) => g.id);
    markDone(started.session, before);
    started.session.current_goal = confirm!.id;
    const ask = confirm!.ask_tl ?? '';
    started.session.last_exchanges = [{ role: 'character', tl: ask }];
    await store.save(started.session);
    const { out, events } = await turn(
      store,
      started.session,
      'pode repetir?',
    );
    assert.equal(lastCharacterPt(events), ask);
    assert.equal(out.session.current_goal, confirm!.id);
  });

  it('T16 · every scene character_id resolves to cast name/avatar', () => {
    for (const bank of loadAllSceneBanks()) {
      const id = bank.scene?.character_id;
      assert.ok(id, `${bank.topic_id} missing character_id`);
      const cast = getCharacter(id!);
      assert.ok(cast, `${bank.topic_id} unknown cast ${id}`);
      assert.ok(cast!.name?.trim(), `${id} missing name`);
    }
  });

  it('T17 · every scene finishes via chips only', async () => {
    for (const bank of loadAllSceneBanks()) {
      const store = new MemoryConvoSessionStore();
      const started = await startFreeConvoSession({
        userId: `t17-${bank.topic_id}`,
        topicId: bank.topic_id!,
        store,
        learnerName: null,
        learnerLevel: 9,
        newId: () => `t17-${bank.topic_id}`,
      });
      let session = started.session;
      for (const goal of bank.goals) {
        if (session.status === 'done') break;
        const chip =
          goal.help.chips[0] ??
          goal.examples_tl[0] ??
          goal.help.frame_tl;
        assert.ok(chip, `${bank.topic_id}/${goal.id} has no chip`);
        const { out } = await turn(store, session, chip, {
          stub: { pt: 'Ok.', goal: goal.id },
        });
        session = out.session;
      }
      assert.equal(
        session.status,
        'done',
        `${bank.topic_id} did not finish on chips`,
      );
    }
  });

  it('T18 · fresh start real route · opening + order_drink', async () => {
    const { started } = await startCafe('t18');
    assert.equal(started.resumed, false);
    assert.equal(started.opening.character.tl, 'Bom dia! Diga.');
    assert.equal(started.session.current_goal, 'cafe.order_drink');
  });

  it('T19 · pay «com caráo» → close-but-wrong stop (batch-rp-4)', async () => {
    const { store, started } = await startCafe('t19');
    markDone(started.session, [
      'order_drink',
      'size',
      'temp',
      'sugar',
      'order_food',
      'water',
      'water_type',
      'here_or_go',
      'ask_price',
    ]);
    started.session.current_goal = 'pay';
    started.session.last_exchanges = [
      { role: 'character', tl: 'Cartão ou dinheiro?' },
    ];
    await store.save(started.session);
    const { out, events } = await turn(store, started.session, 'com caráo', {
      stub: { pt: 'Com cartão, muito bem.', goal: 'pay' },
    });
    assert.equal(out.session.current_goal, 'pay');
    assert.equal(
      out.session.goals.find((g) => g.id === 'pay')?.status,
      'open',
    );
    assert.equal(lastCharacterPt(events), '');
    const coach = events.find(
      (e) => e.type === 'coach' && e.moment === 'close_but_wrong',
    );
    assert.ok(coach);
  });

  it('T20 · reaction with invented «creme» dropped', async () => {
    const { store, started } = await startCafe('t20');
    const { events } = await turn(
      store,
      started.session,
      'quria um cafe con paste de nata',
      {
        stub: {
          pt: 'Um café com creme? Claro!',
          goal: 'cafe.order_drink',
        },
      },
    );
    const pt = lastCharacterPt(events);
    assert.ok(!/creme/i.test(pt), `reaction should be dropped, got: ${pt}`);
    assert.ok(
      /Mais alguma coisa\?|É para comer aqui/i.test(pt),
      `expected next ask, got: ${pt}`,
    );
  });

  it('T21 · real grader fixes all mistakes', async () => {
    const corr = await gradeFreeText({
      answer: 'Ola quria um cafe con paste de nata',
      character_tl: 'Bom dia! Diga.',
      frame_chips: [
        'Queria um café, por favor.',
        'Queria um café com um pastel de nata, por favor.',
      ],
      level: 'A1',
    });
    assert.ok(corr.has_error, 'expected a correction');
    const fixed = corr.corrected_tl;
    assert.match(fixed, /queria/i);
    assert.match(fixed, /café/i);
    assert.match(fixed, /\bcom\b/i);
    assert.match(fixed, /pastel/i);
  });

  it('T22 · ask_price «E a conta?» → price line', async () => {
    const { store, started } = await startCafe('t22');
    markDone(started.session, [
      'cafe.order_drink',
      'cafe.order_food',
      'cafe.here_or_go',
    ]);
    started.session.current_goal = 'cafe.ask_price';
    started.session.last_exchanges = [
      { role: 'character', tl: 'Aqui está! 😊 É tudo?' },
    ];
    await store.save(started.session);
    const { out, events } = await turn(store, started.session, 'E a conta?', {
      stub: { pt: 'São dois euros e sessenta.', goal: 'cafe.ask_price' },
    });
    assert.equal(
      out.session.goals.find((g) => g.id === 'cafe.ask_price')?.status,
      'done',
    );
    assert.match(lastCharacterPt(events), /dois euros e sessenta/i);
  });
});
