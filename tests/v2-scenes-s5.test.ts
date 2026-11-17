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
import { askTlEndsOpen, loadSceneBank } from '@/lib/v2/convo/scenes';
import type { FreeTextCorrection } from '@/lib/v2/grader';

const stubGrader = async (): Promise<FreeTextCorrection> => ({
  has_error: false,
  severity: 'none',
  corrected_tl: '',
  changes: [],
  main_error: null,
  note_eg: '',
  ar: '',
});

const cafeTypoGrader = async (): Promise<FreeTextCorrection> => ({
  has_error: true,
  // accent still emits the correction card; avoid 'error' (async Mongo append).
  severity: 'accent',
  corrected_tl: 'Queria um café, por favor.',
  changes: [{ from: 'quero um cafe', to: 'Queria um café' }],
  main_error: 'form',
  note_eg: 'قول Queria um café.',
  ar: '',
});

async function startScene(topicId: string, userId: string) {
  const store = new MemoryConvoSessionStore();
  const started = await startFreeConvoSession({
    userId,
    topicId,
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

describe('scenes S5 · stub goldens 1–6', () => {
  it('1 · cena-cafe «quero um cafe» completes order + correction + Mais alguma coisa?', async () => {
    const { store, started } = await startScene('cena-cafe', 'u-s5-1');
    const events: ConvoTurnStreamEvent[] = [];
    const out = await runFreeConvoTurn({
      session: started.session,
      learnerText: 'quero um cafe',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () =>
          'Claro! Mais alguma coisa?\nAR: حسناً! هل تريد شيئاً آخر؟\nGOALS: cafe.order_drink',
      }),
      emit: (e) => events.push(e),
      freeTextGrader: cafeTypoGrader,
      learnerTurnId: 'learner-1',
    });
    assert.equal(
      out.session.goals.find((g) => g.id === 'cafe.order_drink')?.status,
      'done',
    );
    assert.equal(out.session.current_goal, 'cafe.order_food');
    const pts = characterPts(events);
    assert.ok(pts.some((p) => /Mais alguma coisa\?/i.test(p)));
    const corr = events.find((e) => e.type === 'correction');
    assert.ok(corr);
    assert.equal(corr.type, 'correction');
    if (corr.type === 'correction') {
      assert.match(corr.corrected_tl, /café/i);
    }
  });

  it('2 · cena-cafe «Quanto é?» keeps dois euros e sessenta and ends open', async () => {
    const { store, started } = await startScene('cena-cafe', 'u-s5-2');
    started.session.goals = started.session.goals.map((g) =>
      [
        'cafe.order_drink',
        'cafe.order_food',
        'cafe.here_or_go',
        'cafe.ask_price',
      ].includes(g.id)
        ? { ...g, status: 'done' as const }
        : g,
    );
    // Learner asking price while ask_price is current — mark prior done, keep ask_price open.
    started.session.goals = started.session.goals.map((g) =>
      g.id === 'cafe.ask_price' ? { ...g, status: 'open' as const } : g,
    );
    started.session.current_goal = 'cafe.ask_price';
    await store.save(started.session);

    const events: ConvoTurnStreamEvent[] = [];
    const out = await runFreeConvoTurn({
      session: started.session,
      learnerText: 'Quanto é?',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () =>
          'São dois euros e sessenta. Cartão ou dinheiro?\nAR: يوروان وستون. بطاقة أم نقداً؟\nGOALS: cafe.ask_price',
      }),
      emit: (e) => events.push(e),
      freeTextGrader: stubGrader,
    });
    assert.equal(
      out.session.goals.find((g) => g.id === 'cafe.ask_price')?.status,
      'done',
    );
    assert.equal(out.session.current_goal, 'cafe.pay');
    const pt = characterPts(events).at(-1) ?? '';
    assert.match(pt, /dois euros e sessenta/i);
    assert.ok(askTlEndsOpen(pt));
  });

  it('3 · cena-mercado «quria frutas» keeps order open and asks which fruit', async () => {
    const { store, started } = await startScene('cena-mercado', 'u-s5-3');
    assert.equal(started.session.current_goal, 'mercado.order');
    const events: ConvoTurnStreamEvent[] = [];
    const out = await runFreeConvoTurn({
      session: started.session,
      learnerText: 'quria frutas',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () =>
          'Que fruta quer? Laranjas ou maçãs?\nAR: أي فاكهة تريد؟\nGOALS: -',
      }),
      emit: (e) => events.push(e),
      freeTextGrader: stubGrader,
    });
    assert.equal(
      out.session.goals.find((g) => g.id === 'mercado.order')?.status,
      'open',
    );
    assert.equal(out.session.current_goal, 'mercado.order');
    const pt = characterPts(events).at(-1) ?? '';
    assert.ok(askTlEndsOpen(pt));
    assert.match(pt, /fruta|laranja|maç/i);
  });

  it('4 · closed stub statement is replaced by ask_tl', async () => {
    const { store, started } = await startScene('cena-cafe', 'u-s5-4');
    const events: ConvoTurnStreamEvent[] = [];
    await runFreeConvoTurn({
      session: started.session,
      learnerText: 'ola',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () =>
          'Olhe, é tudo fresquinho!\nAR: انظر، كل شيء طازج!\nGOALS: -',
      }),
      emit: (e) => events.push(e),
      freeTextGrader: stubGrader,
    });
    const ask = loadSceneBank('cena-cafe').goals.find(
      (g) => g.id === 'cafe.order_drink',
    )!.ask_tl;
    assert.equal(characterPts(events).at(-1), ask);
    assert.ok(askTlEndsOpen(ask));
  });

  it('5 · farewell → closing + scene_done, no further open ask', async () => {
    const { store, started } = await startScene('cena-cafe', 'u-s5-5');
    started.session.goals = started.session.goals.map((g) =>
      g.id === 'cafe.bye' ? g : { ...g, status: 'done' as const },
    );
    started.session.current_goal = 'cafe.bye';
    await store.save(started.session);

    const events: ConvoTurnStreamEvent[] = [];
    const out = await runFreeConvoTurn({
      session: started.session,
      learnerText: 'Obrigado! Até amanhã!',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () => 'unused\nAR: x\nGOALS: cafe.bye',
      }),
      emit: (e) => events.push(e),
      freeTextGrader: stubGrader,
    });
    assert.equal(out.session.status, 'done');
    assert.ok(characterPts(events).some((p) => /Até/i.test(p)));
    assert.ok(events.some((e) => e.type === 'coach' && e.id === 'scene_done'));
    const questions = events.filter((e) => e.type === 'question');
    assert.equal(questions.length, 1);
    assert.equal(questions[0]?.id, 'scene.closing');
  });

  it('6 · cue_eg on cafe.ask_price only (not order_drink)', async () => {
    const bank = loadSceneBank('cena-cafe');
    assert.equal(
      bank.goals.find((g) => g.id === 'cafe.order_drink')?.cue_eg,
      undefined,
    );
    assert.ok(
      bank.goals.find((g) => g.id === 'cafe.ask_price')?.cue_eg?.includes(
        'الحساب',
      ),
    );

    const { store, started } = await startScene('cena-cafe', 'u-s5-6');
    started.session.goals = started.session.goals.map((g) =>
      ['cafe.order_drink', 'cafe.order_food', 'cafe.here_or_go'].includes(g.id)
        ? { ...g, status: 'done' as const }
        : g,
    );
    started.session.current_goal = 'cafe.ask_price';
    await store.save(started.session);

    const events: ConvoTurnStreamEvent[] = [];
    await runFreeConvoTurn({
      session: started.session,
      learnerText: 'hmm',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () =>
          'Aqui está! É tudo?\nAR: تفضل! هل هذا كل شيء؟\nGOALS: -',
      }),
      emit: (e) => events.push(e),
      freeTextGrader: stubGrader,
    });
    const bubble = events.find((e) => e.type === 'bubble_ar');
    assert.ok(bubble && bubble.type === 'bubble_ar');
    assert.ok(bubble.coach_eg?.includes('الحساب'));
  });
});
