/**
 * batch-rp-3 acceptance G1–G18 (cena-cafe format 3, 2026-11-20).
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
import type { SceneLangHelpResult } from '@/lib/v2/convo/scenes/sceneLangHelp';
import type { ConvoGoalBank, SceneLine } from '@/lib/v2/convo/goals/types';
import { checklistGoals } from '@/lib/v2/convo/goals';

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

function helpCoaches(events: ConvoTurnStreamEvent[]) {
  return events.filter(
    (e): e is Extract<ConvoTurnStreamEvent, { type: 'coach' }> =>
      e.type === 'coach' && e.moment === 'help',
  );
}

async function turn(
  store: MemoryConvoSessionStore,
  session: Awaited<ReturnType<typeof startCafe>>['started']['session'],
  text: string,
  stubQwen: SceneQwenResult | Promise<SceneQwenResult> = OTHER,
  stubLangHelp?:
    | SceneLangHelpResult
    | Promise<SceneLangHelpResult | null>
    | 'timeout',
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
    ...(stubLangHelp !== undefined
      ? { stubSceneLangHelp: stubLangHelp }
      : {}),
  });
  return { out, events, session: out.session };
}

async function advanceToWaterType(
  store: MemoryConvoSessionStore,
  session: Awaited<ReturnType<typeof startCafe>>['started']['session'],
) {
  let s = session;
  for (const say of [
    'quero um galão',
    'grande',
    'quente',
    'sem açúcar',
    'um pastel de nata',
    'e uma agua',
  ]) {
    s = (await turn(store, s, say)).out.session;
  }
  assert.equal(s.current_goal, 'water_type');
  return s;
}

async function advanceToSugar(
  store: MemoryConvoSessionStore,
  session: Awaited<ReturnType<typeof startCafe>>['started']['session'],
) {
  let s = session;
  for (const say of ['quero um galão', 'grande', 'quente']) {
    s = (await turn(store, s, say)).out.session;
  }
  assert.equal(s.current_goal, 'sugar');
  return s;
}

before(() => {
  clearSceneLoadCache();
});

describe('batch-rp-3 G1–G18 · cena-cafe format 3 (2026-11-20)', () => {
  it('index lists café first among 15 scenes (batch-rp-4)', () => {
    const index = loadSceneIndex();
    assert.equal(index.path[0]?.id, 'cena-cafe');
    assert.equal(index.path.length, 15);
  });

  it('G1 · golden café run (exact bubbles + coach column)', async () => {
    const bank = loadSceneBank('cena-cafe');
    assert.equal(bank.format, 3);
    assert.deepEqual(
      bank.goals.map((g) => g.id),
      [
        'order_drink',
        'size',
        'temp',
        'sugar',
        'order_food',
        'water',
        'water_type',
        'here_or_go',
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

    const expected: Array<{
      say: string;
      bubble: string;
      coach?: string;
    }> = [
      {
        say: 'Bom dia',
        bubble:
          'Bom dia, bom dia! Está frio hoje, hã? ☕ O que lhe sirvo?',
      },
      {
        say: 'quero um galão',
        bubble: 'Um galão, saindo! Pequeno ou grande?',
      },
      {
        say: 'grande',
        bubble:
          'Grande, muito bem. Também temos com gelo. 🧊 Quente ou frio?',
      },
      {
        say: 'quente',
        bubble: 'Quente, claro. Com açúcar ou sem açúcar?',
      },
      {
        say: 'sem açúcar',
        bubble:
          'Sem açúcar, muito bem. Os pastéis de nata acabaram de sair do forno. 😋 Quer um para acompanhar?',
      },
      {
        say: 'um pastel de nata',
        bubble: 'Boa escolha! E para beber, mais alguma coisa?',
        coach: '💬 جرّب تطلب ماية كمان مع الأوردر.',
      },
      {
        say: 'e uma agua',
        bubble: 'Uma água, claro! Natural ou fresca?',
      },
      {
        say: 'fresca',
        bubble: 'Fresca, muito bem. É para comer aqui ou para levar?',
      },
      {
        say: 'Comer para aqui.',
        bubble:
          'Então sente-se à vontade. Aqui está! 😊 Bom apetite! Precisa de mais alguma coisa?',
      },
      {
        say: 'é tudo, a conta?',
        bubble:
          'É tudo, então! São três euros e dez. Cartão ou dinheiro?',
      },
      {
        say: 'Cartão',
        bubble:
          'Com cartão, sem problema. Pode passar aqui. 💳 Quer fatura com contribuinte?',
        coach:
          '💬 contribuinte = رقمك الضريبي (NIF). هتسمع السؤال ده في أي محل.',
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
        `no suggest on golden path for «${step.say}»`,
      );
      if (step.coach) {
        assert.equal(
          bubble!.coach_eg,
          step.coach,
          `coach for «${step.say}»`,
        );
      } else {
        assert.equal(
          bubble!.coach_eg,
          undefined,
          `no coach for «${step.say}»`,
        );
      }
    }
    assert.equal(session.status, 'done');
  });

  it('G2 · water path skips size/temp/sugar/water/water_type', async () => {
    const bank = loadSceneBank('cena-cafe');
    const { store, started } = await startCafe('g2');
    const { out, events } = await turn(
      store,
      started.session,
      'quero uma água',
    );
    assert.equal(
      lastBubble(events)?.pt,
      'Uma água, claro! Os pastéis de nata acabaram de sair do forno. 😋 Quer um para acompanhar?',
    );
    const listed = checklistGoals(bank, out.session.goals).map((g) => g.id);
    for (const id of [
      'size',
      'temp',
      'sugar',
      'water',
      'water_type',
    ]) {
      assert.ok(!listed.includes(id), `${id} should be inactive`);
    }
    assert.equal(out.session.current_goal, 'order_food');
  });

  it('G3 · help ladder: miss1 suggest[0], miss2 both, miss3 assisted', async () => {
    const bank = loadSceneBank('cena-cafe');
    const drink = bank.goals.find((g) => g.id === 'order_drink')!;
    const { store, started } = await startCafe('g3');
    let session = started.session;

    const r1 = await turn(store, session, 'xyz');
    session = r1.out.session;
    assert.equal(
      lastBubble(r1.events)?.pt,
      'Desculpe, não percebi… Um café? Um galão? 😊',
    );
    // Miss: suggest under unclear bubble only — no duplicate help coach.
    assert.equal(helpCoaches(r1.events).length, 0);
    assert.deepEqual(lastBubble(r1.events)?.suggest, [drink.suggest![0]]);
    assert.equal(session.scene_misses, 1);

    const r2 = await turn(store, session, 'xyz');
    session = r2.out.session;
    assert.equal(
      lastBubble(r2.events)?.pt,
      'Desculpe, não percebi… Um café? Um galão? 😊',
    );
    assert.equal(helpCoaches(r2.events).length, 0);
    assert.deepEqual(lastBubble(r2.events)?.suggest, drink.suggest);
    assert.equal(session.scene_misses, 2);

    const r3 = await turn(store, session, 'xyz');
    session = r3.out.session;
    assert.equal(
      lastBubble(r3.events)?.pt,
      'Os pastéis de nata acabaram de sair do forno. 😋 Quer um para acompanhar?',
    );
    assert.equal(
      session.goals.find((g) => g.id === 'order_drink')?.status,
      'assisted',
    );
    assert.equal(session.current_goal, 'order_food');
    const listed = checklistGoals(bank, session.goals).map((g) => g.id);
    for (const id of ['size', 'temp', 'sugar', 'water']) {
      assert.ok(!listed.includes(id), `${id} inactive after assisted drink`);
    }
  });

  it('G4 · no automatic help on fresh start', async () => {
    const { started } = await startCafe('g4');
    assert.ok(started.opening.character.tl?.trim());
    assert.equal(started.session.scene_misses ?? 0, 0);
    assert.equal(started.session.scene_suggest_shown ?? false, false);
    // Opening has no suggest chips; hint_words available for 💡.
    const drink = loadSceneBank('cena-cafe').goals[0]!;
    assert.equal(drink.hint_words, 'um café · um galão');
  });

  it('G5 · hint_words at order_drink', async () => {
    const bank = loadSceneBank('cena-cafe');
    assert.equal(
      bank.goals.find((g) => g.id === 'order_drink')?.hint_words,
      'um café · um galão',
    );
    const { store, started } = await startCafe('g5');
    const { events } = await turn(store, started.session, 'Bom dia');
    const bubble = lastBubble(events);
    assert.equal(bubble?.hint_words, 'um café · um galão');
  });

  it('G6 · Arabic is in the stream for translate toggle (hidden by default in UI)', async () => {
    const { store, started } = await startCafe('g6');
    assert.ok(started.opening.character.ar?.trim());
    const { events } = await turn(store, started.session, 'Bom dia');
    const bubble = lastBubble(events);
    assert.ok(bubble?.ar?.trim(), 'ar present for translate icon');
    assert.equal(bubble?.suggest, undefined);
  });

  it('G7 · delayed Qwen correction after the bubble', async () => {
    const { store, started } = await startCafe('g7');
    let session = started.session;
    session = (await turn(store, session, 'quero um galão')).out.session;
    session = (await turn(store, session, 'grande')).out.session;
    session = (await turn(store, session, 'quente')).out.session;
    session = (await turn(store, session, 'sem açúcar')).out.session;
    session = (await turn(store, session, 'um pastel de nata')).out.session;
    session = (await turn(store, session, 'e uma agua')).out.session;
    session = (await turn(store, session, 'fresca')).out.session;
    assert.equal(session.current_goal, 'here_or_go');

    const delayed: Promise<SceneQwenResult> = new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          kind: 'other',
          goal: null,
          option: null,
          corrected: 'Para comer aqui.',
          has_error: true,
          note_eg: 'comer para → para comer',
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
      learnerTurnId: 'lt-g7',
    });
    session = out.session;

    assert.ok(lastBubble(events)?.pt?.includes('Aqui está'));
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
  });

  it('G8 · Qwen never writes bubbles', async () => {
    const bank = loadSceneBank('cena-cafe');
    const atoms = authoredTls(bank);
    const { store, started } = await startCafe('g8');
    let session = started.session;
    const lines = [
      'Bom dia',
      'quero um galão',
      'grande',
      'quente',
      'sem açúcar',
      'um pastel de nata',
      'e uma agua',
      'fresca',
      'Comer para aqui.',
      'é tudo, a conta?',
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

  it('G9 · old-format session → fresh start', async () => {
    const store = new MemoryConvoSessionStore();
    const bank = loadSceneBank('cena-cafe');
    const stale = await startFreeConvoSession({
      userId: 'g9',
      topicId: 'cena-cafe',
      store,
      learnerName: null,
      learnerLevel: 9,
      newId: () => 'g9-stale',
    });
    stale.session.scene_format = 2;
    stale.session.goals = [
      { id: 'cafe.order_drink', status: 'done' },
      { id: 'cafe.bye', status: 'open' },
    ];
    stale.session.current_goal = 'cafe.order_drink';
    await store.save(stale.session);

    const started = await startFreeConvoSession({
      userId: 'g9',
      topicId: 'cena-cafe',
      store,
      learnerName: null,
      learnerLevel: 9,
      newId: () => 'g9-fresh',
    });
    assert.equal(started.resumed, false);
    assert.equal(started.session.id, 'g9-fresh');
    assert.equal(started.session.scene_format, 3);
    assert.equal(started.session.current_goal, 'order_drink');
    assert.deepEqual(
      started.session.goals.map((g) => g.id),
      bank.goals.map((g) => g.id),
    );
  });

  it('G10 · coach spacing: 2 bubbles apart → second coach dropped', async () => {
    const { store, started } = await startCafe('g10');
    let session = started.session;
    // Reach water (first coach_before).
    for (const say of [
      'quero um galão',
      'grande',
      'quente',
      'sem açúcar',
      'um pastel de nata',
    ]) {
      session = (await turn(store, session, say)).out.session;
    }
    assert.equal(session.current_goal, 'water');
    // The pastel turn opened water with coach — already consumed.
    assert.ok(
      (session.scene_coach_before_consumed ?? []).includes('water'),
    );
    assert.equal(session.scene_coach_ever_shown, true);

    // Bubble 1 after coach.
    session = (await turn(store, session, 'e uma agua')).out.session;
    // Bubble 2 after coach: jump to pay → opens contribuinte (should drop coach).
    const r = await turn(store, session, 'Cartão');
    session = r.out.session;
    const bubble = lastBubble(r.events);
    assert.ok(bubble?.pt?.includes('Quer fatura com contribuinte'));
    assert.equal(
      bubble?.coach_eg,
      undefined,
      'contribuinte coach dropped (only 2 bubbles since water)',
    );
    assert.ok(
      (session.scene_coach_before_consumed ?? []).includes('contribuinte'),
    );
  });

  it('G11 · end card carries both end_tips_eg', async () => {
    const bank = loadSceneBank('cena-cafe');
    assert.equal(bank.end_tips_eg?.length, 2);
    const { store, started } = await startCafe('g11');
    let session = started.session;
    for (const say of [
      'quero um galão',
      'grande',
      'quente',
      'sem açúcar',
      'um pastel de nata',
      'e uma agua',
      'fresca',
      'Comer para aqui.',
      'é tudo, a conta?',
      'Cartão',
      'Nao obrigado',
      'até amanhã!',
    ]) {
      session = (await turn(store, session, say)).out.session;
    }
    assert.equal(session.status, 'done');
    // Re-run last farewell turn to capture scene_done events.
    const fresh = await startCafe('g11b');
    session = fresh.started.session;
    let lastEvents: ConvoTurnStreamEvent[] = [];
    for (const say of [
      'quero um galão',
      'grande',
      'quente',
      'sem açúcar',
      'um pastel de nata',
      'e uma agua',
      'fresca',
      'Comer para aqui.',
      'é tudo, a conta?',
      'Cartão',
      'Nao obrigado',
    ]) {
      const r = await turn(fresh.store, session, say);
      session = r.out.session;
    }
    const done = await turn(fresh.store, session, 'até amanhã!');
    lastEvents = done.events;
    const sceneDone = lastEvents.find(
      (e) => e.type === 'coach' && e.id === 'scene_done',
    ) as Extract<ConvoTurnStreamEvent, { type: 'coach' }> | undefined;
    assert.ok(sceneDone);
    assert.deepEqual(sceneDone!.end_tips_eg, bank.end_tips_eg);
  });

  it('stuck help · مش عارف → suggest[0], no bubble, no miss++', async () => {
    const bank = loadSceneBank('cena-cafe');
    const drink = bank.goals.find((g) => g.id === 'order_drink')!;
    const { store, started } = await startCafe('stuck');
    const { out, events } = await turn(store, started.session, 'مش عارف');
    assert.equal(characterBubbles(events).length, 0);
    const h = helpCoaches(events);
    assert.equal(h.length, 1);
    assert.equal(h[0]!.eg, 'ممكن تقول:');
    assert.deepEqual(h[0]!.suggest, [drink.suggest![0]]);
    assert.equal(out.session.scene_misses ?? 0, 0);
    assert.equal(out.session.scene_suggest_shown, true);
  });

  it('G12 · punctuation-only correction → no card', async () => {
    const { store, started } = await startCafe('g12');
    let session = started.session;
    session = (await turn(store, session, 'quero um galão')).out.session;
    assert.equal(session.current_goal, 'size');
    const { events } = await turn(store, session, 'Pequeno por favor', {
      kind: 'other',
      goal: null,
      option: null,
      corrected: 'Pequeno, por favor.',
      has_error: true,
      note_eg: 'فاصلة',
    });
    const corrections = events.filter((e) => e.type === 'correction');
    assert.equal(corrections.length, 0);
  });

  it('G13 · não obreigado at ask_price → tudo', async () => {
    const { store, started } = await startCafe('g13');
    let session = started.session;
    for (const say of [
      'quero um galão',
      'grande',
      'quente',
      'sem açúcar',
      'um pastel de nata',
      'e uma agua',
      'fresca',
      'Comer para aqui.',
    ]) {
      session = (await turn(store, session, say)).out.session;
    }
    assert.equal(session.current_goal, 'ask_price');
    const { out, events } = await turn(store, session, 'não obreigado');
    assert.equal(
      lastBubble(events)?.pt,
      'É tudo, então! São três euros e dez. Cartão ou dinheiro?',
    );
    assert.equal(
      out.session.goals.find((g) => g.id === 'ask_price')?.status,
      'done',
    );
    assert.equal(
      out.session.goals.find((g) => g.id === 'ask_price')?.option,
      'tudo',
    );
    assert.equal(out.session.current_goal, 'pay');
  });

  it('G14 · one miss → exactly one «ممكن تقول:» surface', async () => {
    const { store, started } = await startCafe('g14');
    const { events } = await turn(store, started.session, 'xyz');
    const bubbleSuggests = characterBubbles(events).filter(
      (b) => (b.suggest?.length ?? 0) > 0,
    );
    const coaches = helpCoaches(events);
    // Rendered as CharacterBubble «ممكن تقول:» once; no help coach.
    assert.equal(bubbleSuggests.length, 1);
    assert.equal(coaches.length, 0);
    const momkenCount =
      bubbleSuggests.length +
      coaches.filter((c) => c.eg.includes('ممكن تقول')).length;
    assert.equal(momkenCount, 1);
  });

  it('G15 · lang help Qwen stub → coach pt+note, no bubble', async () => {
    const { store, started } = await startCafe('g15');
    const session = await advanceToWaterType(store, started.session);
    const { events } = await turn(
      store,
      session,
      'ازاي اقول ساقع؟',
      OTHER,
      { pt: 'Fresca, por favor.', note_eg: 'fresca = ساقعة' },
    );
    assert.equal(characterBubbles(events).length, 0);
    const coaches = events.filter(
      (e): e is Extract<ConvoTurnStreamEvent, { type: 'coach' }> =>
        e.type === 'coach' && e.moment === 'language_question',
    );
    assert.equal(coaches.length, 1);
    assert.ok(coaches[0]!.eg.includes('تقدر تقول: Fresca, por favor.'));
    assert.ok(coaches[0]!.eg.includes('fresca = ساقعة'));
    assert.deepEqual(coaches[0]!.suggest, ['Fresca, por favor.']);
  });

  it('G15b · Saquei fails check → glossary coach', async () => {
    const { store, started } = await startCafe('g15b');
    const session = await advanceToWaterType(store, started.session);
    const { events } = await turn(
      store,
      session,
      'ازاي اقول ساقع؟',
      OTHER,
      { pt: 'Saquei', note_eg: '' },
    );
    assert.equal(characterBubbles(events).length, 0);
    const coaches = events.filter(
      (e): e is Extract<ConvoTurnStreamEvent, { type: 'coach' }> =>
        e.type === 'coach' && e.moment === 'language_question',
    );
    assert.equal(coaches.length, 1);
    assert.equal(
      coaches[0]!.eg,
      'تقدر تقول: fresca = ساقعة (للماية) · frio = ساقع (للمشروب)',
    );
  });

  it('G16 · timeout + unknown word → suggest[0]', async () => {
    const bank = loadSceneBank('cena-cafe');
    const waterType = bank.goals.find((g) => g.id === 'water_type')!;
    const { store, started } = await startCafe('g16');
    const session = await advanceToWaterType(store, started.session);
    const { events } = await turn(
      store,
      session,
      'ازاي اقول مطار؟',
      OTHER,
      'timeout',
    );
    assert.equal(characterBubbles(events).length, 0);
    const coaches = events.filter(
      (e): e is Extract<ConvoTurnStreamEvent, { type: 'coach' }> =>
        e.type === 'coach' && e.moment === 'language_question',
    );
    assert.equal(coaches.length, 1);
    assert.equal(coaches[0]!.eg, `تقدر تقول: ${waterType.suggest![0]}`);
  });

  it('G17 · opening_coach_eg once on fresh start', async () => {
    const bank = loadSceneBank('cena-cafe');
    const { started } = await startCafe('g17');
    assert.equal(
      started.opening.character.tl,
      'Bom dia! 😊 Então, o que vai ser hoje?',
    );
    assert.equal(
      started.opening.character.coach_eg,
      bank.opening_coach_eg,
    );
    assert.equal(started.session.scene_coach_ever_shown, true);
    assert.equal(started.session.scene_char_bubbles_since_coach, 0);
  });

  it('G18 · Nao perciso at sugar → Sem açúcar react + next ask', async () => {
    const { store, started } = await startCafe('g18');
    const session = await advanceToSugar(store, started.session);
    const { out, events } = await turn(store, session, 'Nao perciso');
    assert.ok(
      lastBubble(events)?.pt?.startsWith('Sem açúcar, muito bem.'),
    );
    assert.equal(
      out.session.goals.find((g) => g.id === 'sugar')?.status,
      'done',
    );
    assert.equal(
      out.session.goals.find((g) => g.id === 'sugar')?.option,
      'sem',
    );
    assert.equal(out.session.current_goal, 'order_food');
  });
});
