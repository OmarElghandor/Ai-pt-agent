import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MemoryConvoSessionStore,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';
import {
  createStubConvoStreamModel,
  runFreeConvoTurn,
} from '@/lib/v2/convo/turn';
import {
  askTlEndsOpen,
  checkSceneGoals,
  loadSceneBank,
  numberWordsInAsk,
  replyKeepsAskNumbers,
  sceneCharacterPersonaJson,
} from '@/lib/v2/convo/scenes';
import { formatCurrentGoalLine } from '@/lib/v2/convo/prompt';
import { goalStatesFromBank } from '@/lib/v2/convo/goals';
import { parseConvoModelSpec } from '@/lib/model';
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

describe('scenes S2 · ordered goal matching', () => {
  it('Sim at supermercado.bag completes only that goal', () => {
    const bank = loadSceneBank('cena-supermercado');
    const states = goalStatesFromBank(bank).map((g) =>
      ['supermercado.ask_where', 'supermercado.thanks'].includes(g.id)
        ? { ...g, status: 'done' as const }
        : g,
    );
    // current = bag
    assert.equal(
      states.find((g) => g.status === 'open')?.id,
      'supermercado.bag',
    );
    const { completedIds } = checkSceneGoals('Sim', bank.goals, states);
    assert.deepEqual(completedIds, ['supermercado.bag']);
  });

  it('Obrigado! at cafe.order_food does not end the scene', () => {
    const bank = loadSceneBank('cena-cafe');
    const states = goalStatesFromBank(bank).map((g) =>
      g.id === 'cafe.order_drink'
        ? { ...g, status: 'done' as const }
        : g,
    );
    assert.equal(
      states.find((g) => g.status === 'open')?.id,
      'cafe.order_food',
    );
    const { completedIds } = checkSceneGoals(
      'Obrigado!',
      bank.goals,
      states,
    );
    assert.ok(!completedIds.includes('cafe.bye'));
    const bye = bank.goals.find((g) => g.id === 'cafe.bye')!;
    assert.equal(bye.farewell, true);
    // Farewell only when current
    const atBye = states.map((g) =>
      g.id === 'cafe.bye' ? g : { ...g, status: 'done' as const },
    );
    const farewellOnly = checkSceneGoals('Obrigado!', bank.goals, atBye);
    assert.deepEqual(farewellOnly.completedIds, ['cafe.bye']);
  });

  it('galão + pastel completes order_drink and order_food', () => {
    const bank = loadSceneBank('cena-cafe');
    const states = goalStatesFromBank(bank);
    const { completedIds } = checkSceneGoals(
      'Bom dia! Queria um galão e um pastel de nata, por favor.',
      bank.goals,
      states,
    );
    assert.deepEqual(completedIds, [
      'cafe.order_drink',
      'cafe.order_food',
    ]);
  });
});

describe('scenes S2 · numbers + open ending', () => {
  it('detects price words in ask_tl and requires them in the reply', () => {
    const ask = 'São dois euros e sessenta. Cartão ou dinheiro?';
    assert.ok(numberWordsInAsk(ask).includes('dois'));
    assert.ok(numberWordsInAsk(ask).includes('sessenta'));
    assert.ok(numberWordsInAsk(ask).includes('euros'));
    assert.equal(
      replyKeepsAskNumbers('São dois euros e sessenta. Cartão?', ask),
      true,
    );
    assert.equal(
      replyKeepsAskNumbers('Aqui está! Cartão ou dinheiro?', ask),
      false,
    );
  });

  it('askTlEndsOpen accepts Diga / Diz invitations', () => {
    assert.equal(askTlEndsOpen('Bom dia! Diga.'), true);
    assert.equal(askTlEndsOpen('Tudo! Diz. 😊'), true);
    assert.equal(askTlEndsOpen('Olhe, é tudo fresquinho!'), false);
  });
});

describe('scenes S2 · prompt + persona', () => {
  it('CURRENT GOAL uses suggested ask + facts in scene mode', () => {
    const line = formatCurrentGoalLine({
      intentEn: 'ask the price',
      askTl: 'Quer saber o preço?',
      goalId: 'mercado.ask_price',
      turnsOnGoal: 0,
      openGoalIds: ['mercado.ask_price'],
      sceneMode: true,
      factsTl: ['Na banca só aceita dinheiro.'],
    });
    assert.match(line, /say this, or something very close/);
    assert.match(line, /Quer saber o preço/);
    assert.match(line, /never invent/);
    assert.match(line, /dinheiro/);
  });

  it('scene persona JSON uses cast name/voice and has no facts_tl', () => {
    const json = sceneCharacterPersonaJson('rita');
    const parsed = JSON.parse(json) as Record<string, unknown>;
    assert.equal(parsed.id, 'rita');
    assert.match(String(parsed.name), /Rita/i);
    assert.equal('facts_tl' in parsed, false);
    assert.ok(typeof parsed.voice === 'string');
  });
});

describe('scenes S2 · free-talk engine branches', () => {
  it('starts cena-cafe directly with opening and no intro coach', async () => {
    const { started } = await startCafe('u-scene-s2');
    assert.equal(started.resumed, false);
    assert.equal(started.session.topic_id, 'cena-cafe');
    assert.equal(started.session.topic_locked, true);
    assert.equal(started.session.current_goal, 'cafe.order_drink');
    assert.equal(started.opening.coach_intros.length, 0);
    assert.match(started.opening.character.tl, /Bom dia/i);
    assert.equal(started.session.character_id, 'manuel');
  });

  it('quero um cafe completes order_drink; stub reply opens Mais alguma coisa?', async () => {
    const { store, started } = await startCafe('u-scene-s2b');
    const events: Array<{ type: string; [k: string]: unknown }> = [];
    const out = await runFreeConvoTurn({
      session: started.session,
      learnerText: 'quero um cafe',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () =>
          'Claro! Mais alguma coisa?\nAR: حسناً! هل تريد شيئاً آخر؟\nGOALS: cafe.order_drink',
      }),
      emit: (e) => events.push(e as { type: string }),
      learnerGender: 'm',
      freeTextGrader: stubGrader,
    });
    assert.equal(
      out.session.goals.find((g) => g.id === 'cafe.order_drink')?.status,
      'done',
    );
    assert.equal(out.session.current_goal, 'cafe.order_food');
    const bubble = events.find((e) => e.type === 'bubble_ar');
    assert.ok(bubble);
    assert.match(String(bubble?.pt ?? ''), /Mais alguma coisa\?/i);
    assert.notEqual(out.session.status, 'done');
  });

  it('closed stub statement is replaced by ask_tl', async () => {
    const { store, started } = await startCafe('u-scene-s2c');
    const events: Array<{ type: string; text?: string; pt?: string }> = [];
    const out = await runFreeConvoTurn({
      session: started.session,
      learnerText: 'ola',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () =>
          'Olhe, é tudo fresquinho!\nAR: انظر، كل شيء طازج!\nGOALS: -',
      }),
      emit: (e) => events.push(e as { type: string; text?: string; pt?: string }),
      freeTextGrader: stubGrader,
    });
    const ask = 'Bom dia! Diga.';
    const bubble = [...events].reverse().find((e) => e.type === 'bubble_ar');
    assert.equal(bubble?.pt, ask);
    assert.ok(askTlEndsOpen(out.session.last_exchanges.at(-1)?.tl ?? ''));
  });

  it('farewell completes with closing and no further open ask', async () => {
    const { store, started } = await startCafe('u-scene-s2d');
    started.session.goals = started.session.goals.map((g) =>
      g.id === 'cafe.bye' ? g : { ...g, status: 'done' as const },
    );
    started.session.current_goal = 'cafe.bye';
    await store.save(started.session);

    const events: Array<{ type: string; eg?: string; pt?: string; id?: string }> =
      [];
    const out = await runFreeConvoTurn({
      session: started.session,
      learnerText: 'Obrigado! Até amanhã!',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () => 'should not be used\nAR: x\nGOALS: cafe.bye',
      }),
      emit: (e) =>
        events.push(e as { type: string; eg?: string; pt?: string; id?: string }),
      freeTextGrader: stubGrader,
    });
    assert.equal(out.session.status, 'done');
    const closing = events.find(
      (e) => e.type === 'bubble_ar' && String(e.pt ?? '').includes('Até'),
    );
    assert.ok(closing);
    const doneCoach = events.find((e) => e.id === 'scene_done');
    assert.ok(doneCoach);
    assert.match(String(doneCoach?.eg ?? ''), /خلصت/);
    const questions = events.filter((e) => e.type === 'question');
    assert.equal(questions.length, 1);
    assert.equal(questions[0]?.id, 'scene.closing');
  });

  it('cue_eg is on ask_price bubble, not order_drink', async () => {
    const { store, started } = await startCafe('u-scene-s2e');
    started.session.goals = started.session.goals.map((g) =>
      ['cafe.order_drink', 'cafe.order_food', 'cafe.here_or_go'].includes(g.id)
        ? { ...g, status: 'done' as const }
        : g,
    );
    started.session.current_goal = 'cafe.ask_price';
    await store.save(started.session);

    const events: Array<{ type: string; coach_eg?: string; pt?: string }> = [];
    await runFreeConvoTurn({
      session: started.session,
      learnerText: 'hmm',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () =>
          'Aqui está! É tudo?\nAR: تفضل! هل هذا كل شيء؟\nGOALS: -',
      }),
      emit: (e) =>
        events.push(e as { type: string; coach_eg?: string; pt?: string }),
      freeTextGrader: stubGrader,
    });
    const bubble = events.find((e) => e.type === 'bubble_ar');
    assert.ok(bubble?.coach_eg?.includes('الحساب'));

    const bank = loadSceneBank('cena-cafe');
    assert.equal(
      bank.goals.find((g) => g.id === 'cafe.order_drink')?.cue_eg,
      undefined,
    );
  });

  it('resume replays the last character bubble', async () => {
    const { store, started } = await startCafe('u-scene-s2f');
    started.session.last_exchanges = [
      { role: 'character', tl: 'Mais alguma coisa?' },
      { role: 'learner', tl: 'um pastel' },
    ];
    started.session.current_goal = 'cafe.order_food';
    await store.save(started.session);

    const resumed = await startFreeConvoSession({
      userId: 'u-scene-s2f',
      topicId: 'cena-cafe',
      store,
      learnerName: null,
      learnerLevel: 9,
      sessionId: started.session.id,
    });
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.opening.character.tl, 'Mais alguma coisa?');
  });

  it('default scene model label is haiku when override empty', () => {
    assert.equal(parseConvoModelSpec('haiku').label, 'haiku');
    assert.equal(parseConvoModelSpec(null).label, 'qwen');
  });
});
