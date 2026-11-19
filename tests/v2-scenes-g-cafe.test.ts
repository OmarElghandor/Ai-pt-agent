/**
 * batch-rp-3 acceptance G1–G11 (cena-cafe format 3, Qwen stubbed).
 */
import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import {
  MemoryConvoSessionStore,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';
import {
  createStubConvoStreamModel,
  runFreeConvoTurn,
  type ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn';
import {
  clearSceneLoadCache,
  loadSceneBank,
  loadSceneIndex,
} from '@/lib/v2/convo/scenes';
import type { SceneQwenResult } from '@/lib/v2/convo/scenes/qwenScene';
import type { ConvoGoalBank, SceneLine } from '@/lib/v2/convo/goals/types';

const OTHER: SceneQwenResult = {
  kind: 'other',
  goal: null,
  option: null,
  corrected: '',
  has_error: false,
  note_eg: '',
};

function authoredTls(bank: ConvoGoalBank): Set<string> {
  const out = new Set<string>();
  const add = (line: SceneLine | undefined | null) => {
    if (line?.tl?.trim()) out.add(line.tl.trim());
    if (line?.tl_f?.trim()) out.add(line.tl_f.trim());
  };
  for (const l of bank.opening_lines ?? []) add(l);
  for (const l of bank.closing_lines ?? []) add(l);
  if (bank.global) {
    for (const l of bank.global.greeting.react) add(l);
    for (const l of bank.global.thanks.react) add(l);
    for (const l of bank.global.side_unknown.react) add(l);
  }
  for (const g of bank.goals) {
    for (const l of g.ask ?? []) add(l);
    for (const l of g.unclear ?? []) add(l);
    for (const o of g.options ?? []) {
      for (const l of o.react) add(l);
    }
  }
  return out;
}

function isAuthoredBubble(pt: string, atoms: Set<string>): boolean {
  const t = pt.trim();
  if (atoms.has(t)) return true;
  for (const a of atoms) {
    if (!t.startsWith(a)) continue;
    const rest = t.slice(a.length).trim();
    if (!rest || atoms.has(rest)) return true;
  }
  return false;
}

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

function characterBubbles(events: ConvoTurnStreamEvent[]) {
  return events.filter(
    (e): e is Extract<ConvoTurnStreamEvent, { type: 'bubble_ar' }> =>
      e.type === 'bubble_ar',
  );
}

function lastBubble(
  events: ConvoTurnStreamEvent[],
): Extract<ConvoTurnStreamEvent, { type: 'bubble_ar' }> | undefined {
  const bs = characterBubbles(events);
  return bs[bs.length - 1];
}

function hints(events: ConvoTurnStreamEvent[]) {
  return events.filter((e) => e.type === 'coach' && e.moment === 'help');
}

function frames(events: ConvoTurnStreamEvent[]) {
  return events.filter(
    (e): e is Extract<ConvoTurnStreamEvent, { type: 'free_frame' }> =>
      e.type === 'free_frame',
  );
}

async function turn(
  store: MemoryConvoSessionStore,
  session: Awaited<ReturnType<typeof startCafe>>['started']['session'],
  text: string,
  stubQwen: SceneQwenResult | Promise<SceneQwenResult> = OTHER,
) {
  const events: ConvoTurnStreamEvent[] = [];
  const out = await runFreeConvoTurn({
    session,
    learnerText: text,
    store,
    model: createStubConvoStreamModel({
      byCandidate: () => 'SHOULD_NOT_REACH_BUBBLE',
    }),
    emit: (e) => events.push(e),
    stubSceneQwen: stubQwen,
  });
  return { out, events, session: out.session };
}

before(() => {
  clearSceneLoadCache();
});

describe('batch-rp-3 G1–G11 · cena-cafe format 3', () => {
  it('index lists only the café', () => {
    const index = loadSceneIndex();
    assert.deepEqual(
      index.path.map((p) => p.id),
      ['cena-cafe'],
    );
  });

  it('G1 · golden café run (exact bubbles)', async () => {
    const bank = loadSceneBank('cena-cafe');
    assert.equal(bank.format, 3);
    assert.deepEqual(
      bank.goals.map((g) => g.id),
      [
        'order_drink',
        'order_food',
        'here_or_go',
        'sugar',
        'first_time',
        'origin',
        'ask_price',
        'pay',
        'contribuinte',
        'bye',
      ],
    );
    const { store, started } = await startCafe('g1');
    assert.equal(
      started.opening.character.tl,
      'Bom dia! 😊 Então, o que vai ser hoje?',
    );
    assert.equal(started.session.scene_format, 3);

    const expected: Array<{ say: string; bubble: string }> = [
      {
        say: 'Bom dia',
        bubble:
          'Bom dia, bom dia! Está frio hoje, hã? ☕ O que lhe sirvo?',
      },
      {
        say: 'quero um cafe',
        bubble:
          'Um café, saindo! Os pastéis de nata acabaram de sair do forno. 😋 Quer um para acompanhar?',
      },
      {
        say: 'um pastel de nata',
        bubble: 'Boa escolha! É para comer aqui ou para levar?',
      },
      {
        say: 'Comer para aqui.',
        bubble: 'Então sente-se à vontade. 😊 Com açúcar ou sem açúcar?',
      },
      {
        say: 'sem açúcar',
        bubble:
          'Sem açúcar, muito bem. É a primeira vez que vem cá? Nunca o vi por aqui! 😊',
      },
      {
        say: 'sim, moro aqui perto',
        bubble: 'Ah, então somos vizinhos! E de onde é?',
      },
      {
        say: 'sou do Egito',
        bubble:
          'Do Egito! Que bom! Adoro as pirâmides. 😍 Aqui está! 😊 Mais alguma coisa, ou é tudo?',
      },
      {
        say: 'a tudo, e quenta?',
        bubble: 'É tudo, então! São dois euros e sessenta. Cartão ou dinheiro?',
      },
      {
        say: 'Cartão',
        bubble:
          'Com cartão, sem problema. Pode passar aqui. 💳 Quer fatura com contribuinte?',
      },
      {
        say: 'Nao obrigado',
        bubble: 'Muito bem. Obrigado e bom dia! Até amanhã? 😊',
      },
      {
        say: 'até amanhã!',
        bubble: 'Até amanhã! 👋',
      },
    ];

    let session = started.session;
    for (const step of expected) {
      const { out, events } = await turn(store, session, step.say);
      session = out.session;
      const bubble = lastBubble(events);
      assert.ok(bubble, `missing bubble for «${step.say}»`);
      assert.equal(bubble!.pt, step.bubble, `learner «${step.say}»`);
      assert.equal(
        bubble!.suggest,
        undefined,
        `no suggest chips before L4 for «${step.say}»`,
      );
    }
    assert.equal(session.status, 'done');
  });

  it('G2 · unclear then hint on second miss', async () => {
    const bank = loadSceneBank('cena-cafe');
    const what = bank.goals[0]!.hints!.what_eg;
    const { store, started } = await startCafe('g2');
    let session = started.session;
    const r1 = await turn(store, session, 'xyz');
    session = r1.out.session;
    assert.equal(
      lastBubble(r1.events)?.pt,
      'Desculpe, não percebi… Um café? Um galão? 😊',
    );
    assert.equal(hints(r1.events).length, 0);
    assert.equal(session.scene_misses, 1);

    const r2 = await turn(store, session, 'xyz');
    session = r2.out.session;
    assert.equal(
      lastBubble(r2.events)?.pt,
      'Desculpe, não percebi… Um café? Um galão? 😊',
    );
    assert.ok(hints(r2.events).length >= 1);
    assert.equal(hints(r2.events)[0]!.eg, what);
    assert.equal(session.scene_misses, 2);
    assert.equal(session.scene_hint_level, 1);
  });

  it('G3 · مش عارف → hint only, no bubble, no miss', async () => {
    const bank = loadSceneBank('cena-cafe');
    const what = bank.goals[0]!.hints!.what_eg;
    const { store, started } = await startCafe('g3');
    const { out, events } = await turn(store, started.session, 'مش عارف');
    assert.equal(characterBubbles(events).length, 0);
    assert.ok(hints(events).length >= 1);
    assert.equal(hints(events)[0]!.eg, what);
    assert.equal(out.session.scene_misses ?? 0, 0);
    assert.equal(out.session.scene_hint_level, 1);
  });

  it('G4 · Quanto é? jumps to ask_price', async () => {
    const { store, started } = await startCafe('g4');
    let session = started.session;
    const drink = await turn(store, session, 'quero um cafe');
    session = drink.out.session;
    assert.equal(session.current_goal, 'order_food');

    const r = await turn(store, session, 'Quanto é?');
    session = r.out.session;
    assert.equal(
      lastBubble(r.events)?.pt,
      'Claro! São dois euros e sessenta. Cartão ou dinheiro?',
    );
    const byId = Object.fromEntries(session.goals.map((g) => [g.id, g.status]));
    assert.equal(byId.order_food, 'skipped');
    assert.equal(byId.here_or_go, 'skipped');
    assert.equal(byId.sugar, 'skipped');
    assert.equal(byId.first_time, 'skipped');
    assert.equal(byId.origin, 'skipped');
    assert.equal(byId.ask_price, 'done');
    assert.equal(session.current_goal, 'pay');
  });

  it('G5 · Qwen pay at order_drink (not candidate) → unclear', async () => {
    const { store, started } = await startCafe('g5');
    const { out, events } = await turn(store, started.session, 'xyz', {
      kind: 'answer',
      goal: 'pay',
      option: 'cartão',
      corrected: '',
      has_error: false,
      note_eg: '',
    });
    assert.equal(
      lastBubble(events)?.pt,
      'Desculpe, não percebi… Um café? Um galão? 😊',
    );
    assert.equal(out.session.current_goal, 'order_drink');
  });

  it('G6 · every bubble has ar; suggest chips only at ladder level 4', async () => {
    const { store, started } = await startCafe('g6');
    assert.ok(started.opening.character.ar?.trim());
    const { events } = await turn(store, started.session, 'Bom dia');
    const bubble = lastBubble(events);
    assert.ok(bubble?.ar?.trim());
    assert.equal(bubble?.suggest, undefined);
    const frame = frames(events).at(-1);
    assert.ok(frame);
    assert.equal(frame!.chips.length, 0);
  });

  it('G7 · no model text reaches a bubble', async () => {
    const bank = loadSceneBank('cena-cafe');
    const atoms = authoredTls(bank);
    const { store, started } = await startCafe('g7');
    let session = started.session;
    const lines = [
      'Bom dia',
      'quero um cafe',
      'um pastel de nata',
      'Comer para aqui.',
      'sem açúcar',
      'sim, moro aqui perto',
      'sou do Egito',
      'a tudo, e quenta?',
      'Cartão',
      'Nao obrigado',
      'até amanhã!',
    ];
    for (const say of lines) {
      const { out, events } = await turn(store, session, say);
      session = out.session;
      for (const b of characterBubbles(events)) {
        assert.notEqual(b.pt, 'SHOULD_NOT_REACH_BUBBLE');
        assert.ok(
          isAuthoredBubble(b.pt ?? '', atoms),
          `non-authored bubble: ${b.pt}`,
        );
      }
    }
  });

  it('G8 · after 3rd miss, next miss → assisted + next ask only', async () => {
    const { store, started } = await startCafe('g8');
    let session = started.session;
    for (let i = 0; i < 3; i++) {
      const r = await turn(store, session, 'xyz');
      session = r.out.session;
    }
    assert.equal(session.scene_misses, 3);
    assert.equal(session.current_goal, 'order_drink');

    const r4 = await turn(store, session, 'xyz');
    session = r4.out.session;
    assert.equal(
      lastBubble(r4.events)?.pt,
      'Os pastéis de nata acabaram de sair do forno. 😋 Quer um para acompanhar?',
    );
    const drink = session.goals.find((g) => g.id === 'order_drink');
    assert.equal(drink?.status, 'assisted');
    assert.equal(session.current_goal, 'order_food');
  });

  it('G9 · تلميح ladder ×4 then suggest → assisted', async () => {
    const bank = loadSceneBank('cena-cafe');
    const drink = bank.goals.find((g) => g.id === 'order_drink')!;
    const { store, started } = await startCafe('g9');
    let session = started.session;

    const r1 = await turn(store, session, 'تلميح');
    session = r1.out.session;
    assert.equal(hints(r1.events)[0]?.eg, drink.hints!.what_eg);
    assert.equal(session.scene_hint_level, 1);
    assert.equal(frames(r1.events).at(-1)?.chips.length, 0);

    const r2 = await turn(store, session, 'تلميح');
    session = r2.out.session;
    assert.equal(hints(r2.events)[0]?.eg, drink.hints!.words_eg);
    assert.equal(session.scene_hint_level, 2);

    const r3 = await turn(store, session, 'تلميح');
    session = r3.out.session;
    assert.equal(hints(r3.events)[0]?.eg, drink.hints!.frame_tl);
    assert.equal(session.scene_hint_level, 3);

    const r4 = await turn(store, session, 'تلميح');
    session = r4.out.session;
    assert.equal(session.scene_hint_level, 4);
    const chips = frames(r4.events).at(-1)?.chips ?? [];
    assert.equal(chips.length, 2);
    assert.deepEqual(chips, drink.suggest);

    const r5 = await turn(store, session, 'Queria um café, por favor.');
    session = r5.out.session;
    const status = session.goals.find((g) => g.id === 'order_drink')?.status;
    assert.equal(status, 'assisted');
    assert.equal(session.current_goal, 'order_food');
  });

  it('G10 · delayed Qwen correction after code-match bubble', async () => {
    const { store, started } = await startCafe('g10');
    let session = started.session;
    // Advance to here_or_go
    session = (await turn(store, session, 'quero um cafe')).out.session;
    session = (await turn(store, session, 'um pastel de nata')).out.session;
    assert.equal(session.current_goal, 'here_or_go');

    const delayed: Promise<SceneQwenResult> = new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          kind: 'other',
          goal: null,
          option: null,
          corrected: 'Para comer aqui.',
          has_error: true,
          note_eg: 'para comer aqui',
        });
      }, 1000);
    });

    const order: string[] = [];
    const events: ConvoTurnStreamEvent[] = [];
    const out = await runFreeConvoTurn({
      session,
      learnerText: 'par aqui',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () => 'SHOULD_NOT_REACH_BUBBLE',
      }),
      emit: (e) => {
        events.push(e);
        if (e.type === 'bubble_ar') order.push('bubble');
        if (e.type === 'correction') order.push('correction');
        if (e.type === 'done') order.push('done');
      },
      stubSceneQwen: delayed,
      learnerTurnId: 'lt-g10',
    });
    session = out.session;

    assert.ok(
      lastBubble(events)?.pt?.includes('Com açúcar ou sem açúcar'),
    );
    const correction = events.find((e) => e.type === 'correction');
    assert.ok(correction);
    assert.equal(
      (correction as Extract<ConvoTurnStreamEvent, { type: 'correction' }>)
        .corrected_tl,
      'Para comer aqui.',
    );
    assert.deepEqual(
      order.filter((x) => x === 'bubble' || x === 'correction' || x === 'done'),
      ['bubble', 'correction', 'done'],
    );
    assert.equal(
      (correction as Extract<ConvoTurnStreamEvent, { type: 'correction' }>)
        .learner_turn_id,
      'lt-g10',
    );
  });

  it('G11 · old-format session → opening starts fresh', async () => {
    const store = new MemoryConvoSessionStore();
    const bank = loadSceneBank('cena-cafe');
    // Seed an open session with the wrong format + stale goal ids.
    const stale = await startFreeConvoSession({
      userId: 'g11',
      topicId: 'cena-cafe',
      store,
      learnerName: null,
      learnerLevel: 9,
      newId: () => 'g11-stale',
    });
    stale.session.scene_format = 2;
    stale.session.goals = [
      { id: 'cafe.order_drink', status: 'done' },
      { id: 'cafe.bye', status: 'open' },
    ];
    stale.session.current_goal = 'cafe.order_drink';
    stale.session.last_exchanges = [
      {
        role: 'character',
        tl: 'Não obrigado? Claro! …',
      },
    ];
    await store.save(stale.session);

    const started = await startFreeConvoSession({
      userId: 'g11',
      topicId: 'cena-cafe',
      store,
      learnerName: null,
      learnerLevel: 9,
      newId: () => 'g11-fresh',
    });
    assert.equal(started.resumed, false);
    assert.equal(started.session.id, 'g11-fresh');
    assert.equal(started.session.scene_format, 3);
    assert.equal(started.session.current_goal, 'order_drink');
    assert.deepEqual(
      started.session.goals.map((g) => g.id),
      bank.goals.map((g) => g.id),
    );
    assert.ok(
      started.session.goals.every((g) => g.status === 'open'),
    );
    assert.equal(
      started.opening.character.tl,
      'Bom dia! 😊 Então, o que vai ser hoje?',
    );
  });
});
