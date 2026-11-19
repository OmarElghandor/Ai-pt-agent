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
import {
  goalExamplesIncludeRepeat,
  isSceneRepeatRequest,
  loadSceneBank,
} from '@/lib/v2/convo/scenes';
import { isStuckHelpRequest } from '@/lib/v2/convo/goals';
import type { FreeTextCorrection } from '@/lib/v2/grader';
import { FREE_TEXT_TIMEOUT_MS } from '@/lib/v2/grader';

const stubGrader = async (): Promise<FreeTextCorrection> => ({
  has_error: false,
  severity: 'none',
  corrected_tl: '',
  changes: [],
  main_error: null,
  note_eg: '',
  ar: '',
});

function correctionGrader(
  corrected: string,
): (input: { answer: string }) => Promise<FreeTextCorrection> {
  return async () => ({
    has_error: true,
    severity: 'error',
    corrected_tl: corrected,
    changes: [{ from: 'x', to: corrected }],
    main_error: {
      from: 'x',
      to: corrected,
      type: 'spelling/spelling',
    },
    note_eg: 'صحح كده',
    ar: '',
  });
}

function lastPt(events: ConvoTurnStreamEvent[]): string {
  return (
    events
      .filter(
        (e): e is Extract<ConvoTurnStreamEvent, { type: 'bubble_ar' }> =>
          e.type === 'bubble_ar',
      )
      .map((e) => e.pt)
      .at(-1) ?? ''
  );
}

async function startTopic(topicId: string, userId: string) {
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

describe('scenes live-fixes · correction cards', () => {
  const cases: Array<{
    topic: string;
    setup?: (session: Awaited<
      ReturnType<typeof startFreeConvoSession>
    >['session']) => void;
    text: string;
    corrected: string;
  }> = [
    {
      topic: 'cena-cafe',
      setup: (s) => {
        s.goals = s.goals.map((g) =>
          [
            'cafe.order_drink',
            'cafe.order_food',
            'cafe.here_or_go',
            'cafe.ask_price',
          ].includes(g.id)
            ? { ...g, status: 'done' as const }
            : g,
        );
        s.current_goal = 'cafe.pay';
      },
      text: 'Con cartão',
      corrected: 'Com cartão.',
    },
    {
      topic: 'cena-cafe',
      setup: (s) => {
        s.goals = s.goals.map((g) =>
          [
            'cafe.order_drink',
            'cafe.order_food',
            'cafe.here_or_go',
            'cafe.ask_price',
            'cafe.pay',
          ].includes(g.id)
            ? { ...g, status: 'done' as const }
            : g,
        );
        s.current_goal = 'cafe.contribuinte';
      },
      text: 'Nao perciso',
      corrected: 'Não preciso.',
    },
    {
      topic: 'cena-restaurante',
      setup: (s) => {
        s.goals = s.goals.map((g) =>
          g.id === 'restaurante.table' ? { ...g, status: 'done' as const } : g,
        );
        s.current_goal = 'restaurante.menu';
      },
      text: 'nao como porco',
      corrected: 'Não como carne de porco.',
    },
    {
      topic: 'cena-restaurante',
      setup: (s) => {
        s.goals = s.goals.map((g) =>
          [
            'restaurante.table',
            'restaurante.menu',
            'restaurante.choose',
            'restaurante.soup',
          ].includes(g.id)
            ? { ...g, status: 'done' as const }
            : g,
        );
        s.current_goal = 'restaurante.drink';
      },
      text: 'agua',
      corrected: 'Uma água, por favor.',
    },
  ];

  for (const c of cases) {
    it(`emits correction for «${c.text}»`, async () => {
      const { store, started } = await startTopic(
        c.topic,
        `u-fix-${c.text.slice(0, 8)}`,
      );
      c.setup?.(started.session);
      await store.save(started.session);
      const events: ConvoTurnStreamEvent[] = [];
      await runFreeConvoTurn({
        session: started.session,
        learnerText: c.text,
        store,
        model: createStubConvoStreamModel({
          byCandidate: () =>
            `Ok.\nAR: حسناً.\nGOALS: ${started.session.current_goal}`,
        }),
        emit: (e) => events.push(e),
        freeTextGrader: correctionGrader(c.corrected),
        learnerTurnId: `lt-${c.text}`,
      });
      const corr = events.find((e) => e.type === 'correction');
      assert.ok(corr, `expected correction for «${c.text}»`);
      assert.equal(corr.type, 'correction');
      if (corr.type === 'correction') {
        assert.equal(corr.corrected_tl, c.corrected);
      }
    });
  }

  it('scene finish waits for a slow grader', async () => {
    const { store, started } = await startTopic('cena-cafe', 'u-slow-grade');
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
    started.session.current_goal = 'cafe.pay';
    await store.save(started.session);

    const events: ConvoTurnStreamEvent[] = [];
    const t0 = Date.now();
    await runFreeConvoTurn({
      session: started.session,
      learnerText: 'Con cartão',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () =>
          'Cartão, muito bem.\nAR: حسناً.\nGOALS: cafe.pay',
      }),
      emit: (e) => events.push(e),
      freeTextGrader: async () => {
        await new Promise((r) => setTimeout(r, 3_200));
        return correctionGrader('Com cartão.')({ answer: '' });
      },
      learnerTurnId: 'lt-slow',
    });
    assert.ok(Date.now() - t0 > 3_000);
    assert.ok(Date.now() - t0 < FREE_TEXT_TIMEOUT_MS + 2_000);
    assert.ok(events.some((e) => e.type === 'correction'));
  });
});

describe('scenes live-fixes · repeat / side / help', () => {
  it('isSceneRepeatRequest detects PT and Arabic', () => {
    assert.equal(isSceneRepeatRequest('Pode repetir?'), true);
    assert.equal(isSceneRepeatRequest('Mais devagar'), true);
    assert.equal(isSceneRepeatRequest('Não percebi'), true);
    assert.equal(isSceneRepeatRequest('مش فاهم'), true);
    assert.equal(isSceneRepeatRequest('تاني'), true);
    assert.equal(isSceneRepeatRequest('quero um cafe'), false);
  });

  it('pode repetir? at direcoes.confirm replays ask slowly and stays', async () => {
    const { store, started } = await startTopic('cena-direcoes', 'u-rep');
    started.session.goals = started.session.goals.map((g) =>
      g.id === 'direcoes.ask' ? { ...g, status: 'done' as const } : g,
    );
    started.session.current_goal = 'direcoes.confirm';
    await store.save(started.session);
    const ask = loadSceneBank('cena-direcoes').goals.find(
      (g) => g.id === 'direcoes.confirm',
    )!.ask_tl!;
    const events: ConvoTurnStreamEvent[] = [];
    const out = await runFreeConvoTurn({
      session: started.session,
      learnerText: 'pode repetir?',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () => 'unused\nAR: x\nGOALS: direcoes.far',
      }),
      emit: (e) => events.push(e),
      freeTextGrader: stubGrader,
    });
    assert.equal(out.session.current_goal, 'direcoes.confirm');
    assert.equal(lastPt(events), ask);
    const bubble = events.find((e) => e.type === 'bubble_ar');
    assert.ok(bubble && bubble.type === 'bubble_ar');
    assert.equal(bubble.playback, 'slow');
  });

  it('encomenda.sign still completes on its repeat example', () => {
    const goal = loadSceneBank('cena-encomenda').goals.find(
      (g) => g.id === 'encomenda.sign',
    );
    assert.ok(goalExamplesIncludeRepeat(goal, 'Desculpe, pode repetir?'));
  });

  it('Tem pastel sem açúcar? → neutral, no temos', async () => {
    const { store, started } = await startTopic('cena-cafe', 'u-sugar');
    started.session.goals = started.session.goals.map((g) =>
      g.id === 'cafe.order_drink' ? { ...g, status: 'done' as const } : g,
    );
    started.session.current_goal = 'cafe.order_food';
    await store.save(started.session);
    const events: ConvoTurnStreamEvent[] = [];
    await runFreeConvoTurn({
      session: started.session,
      learnerText: 'Tem pastel de nata sem açúcar?',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () =>
          'Claro, temos pastel sem açúcar!\nAR: نعم!\nGOALS: cafe.order_food',
      }),
      emit: (e) => events.push(e),
      freeTextGrader: stubGrader,
    });
    const pt = lastPt(events);
    assert.match(pt, /não sei|deixe-me ver/i);
    assert.doesNotMatch(pt, /temos/i);
    assert.match(pt, /Mais alguma coisa\?/i);
  });

  it('مش عارف and ساعدني show help.eg + 2 chips', async () => {
    assert.equal(isStuckHelpRequest('ساعدني'), true);
    for (const text of ['مش عارف', 'ساعدني'] as const) {
      const { store, started } = await startTopic('cena-cafe', `u-help-${text}`);
      const events: ConvoTurnStreamEvent[] = [];
      const out = await runFreeConvoTurn({
        session: started.session,
        learnerText: text,
        store,
        model: createStubConvoStreamModel({
          byCandidate: () => 'unused\nAR: x\nGOALS: -',
        }),
        emit: (e) => events.push(e),
        freeTextGrader: stubGrader,
      });
      const frame = events.find((e) => e.type === 'free_frame');
      assert.ok(frame && frame.type === 'free_frame', text);
      assert.ok(frame.eg.trim().length > 0, text);
      assert.equal(frame.chips.length, 2, text);
      assert.equal(out.session.current_goal, 'cafe.order_drink');
    }
  });
});
