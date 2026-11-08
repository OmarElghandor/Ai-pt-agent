import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildConvoPrompt,
  setConvoPromptBudgetTestExtra,
} from '@/lib/v2/convo/prompt';
import {
  MemoryConvoSessionStore,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';
import {
  createStubConvoStreamModel,
  runFreeConvoTurn,
  type ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn';
import { loadFreeTopicsFile, loadThreadTopic } from '@/lib/v2/convo/topics';

describe('v2 free chat · T7.2 prompt (superseded by C4)', () => {
  it('legacy buildConvoPrompt free path still returns six parts', () => {
    const built = buildConvoPrompt({
      module: 'free',
      pack: null,
      freeTopicTitle: 'Comida',
      facts: ['likes rice'],
      suggestedWords: ['arroz', 'frango'],
      event: {
        verdict: 'correct',
        item_id: '',
        question_id: 'comida.t1.ask',
        question_kind: 'open',
        phase: 'teaching',
      },
      eventLine: 'learner replied',
      candidates: [],
      lastExchanges: [{ role: 'learner', tl: 'Sim' }],
      learnerAnswer: 'Sim',
    });
    assert.equal(built.parts.length, 6);
    assert.doesNotMatch(built.assembled, /accepted forms|coach bank|يعني/);
  });
});

describe('v2 free chat · 30-turn never ends without a question', () => {
  it('goal-directed turns keep a steering question', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'free-u1',
      topicId: 'comida',
      store,
      newId: () => 'free-sess-1',
    });
    let session = started.session;
    assert.equal(session.module, 'free');
    assert.ok(session.goals.length > 0);
    assert.ok(session.pending_question);

    // v3: model writes reaction + one question (no authored_append).
    const model = createStubConvoStreamModel({
      byCandidate: () =>
        'Que interessante! E tu, o que comes?\nAR: رائع!\nGOALS: -',
    });

    for (let i = 0; i < 30; i++) {
      const events: ConvoTurnStreamEvent[] = [];
      const out = await runFreeConvoTurn({
        session,
        learnerText: i === 0 ? '' : 'Sim, gosto.',
        store,
        model,
        emit: (e) => events.push(e),
      });
      session = out.session;
      assert.ok(
        !events.some((e) => e.type === 'authored_append'),
        `turn ${i + 1} must not authored_append`,
      );
      const q = events.filter((e) => e.type === 'question');
      assert.ok(q.length >= 1, `turn ${i + 1} missing question event`);
      const lastQ = q[q.length - 1]!;
      assert.ok(
        lastQ.type === 'question' && lastQ.tl.includes('?'),
        `turn ${i + 1} question text: ${lastQ.type === 'question' ? lastQ.tl : ''}`,
      );
    }
  });
});

describe('v2 free chat · budget (T7.2 / T2.2 free run)', () => {
  async function playFreeBudgetTurns(n: number): Promise<number[]> {
    const inputTokens: number[] = [];
    const store = new MemoryConvoSessionStore();
    // Goal-directed topic — unlocked open only reasks and does not call the model.
    const started = await startFreeConvoSession({
      userId: 'free-budget',
      topicId: 'comida',
      store,
      newId: () => 'free-budget-sess',
      learnerName: 'Omar',
    });
    let session = started.session;
    const model = createStubConvoStreamModel({
      byCandidate: () =>
        'Que fixe! E tu, o que comes?\nAR: رائع!\nGOALS: -',
    });

    for (let i = 0; i < n; i++) {
      const events: ConvoTurnStreamEvent[] = [];
      const out = await runFreeConvoTurn({
        session,
        learnerText: i === 0 ? '' : 'Gosto de arroz.',
        store,
        model,
        emit: (e) => events.push(e),
      });
      session = out.session;
      const m = events.find((e) => e.type === 'metrics');
      if (m && m.type === 'metrics' && m.input_tokens > 0) {
        inputTokens.push(m.input_tokens);
      }
    }
    return inputTokens;
  }

  function budgetOk(turn3: number, turnN: number): boolean {
    return turnN <= turn3 * 1.1;
  }

  it('turn 30 input tokens stay within 10% of turn 3', async () => {
    setConvoPromptBudgetTestExtra(null);
    try {
      const tokens = await playFreeBudgetTurns(30);
      assert.equal(tokens.length, 30);
      const turn3 = tokens[2]!;
      const turn30 = tokens[29]!;
      assert.ok(
        budgetOk(turn3, turn30),
        `budget blown: turn3=${turn3} turn30=${turn30}`,
      );
    } finally {
      setConvoPromptBudgetTestExtra(null);
    }
  });

  it('fails when a growing line is added to the prompt', async () => {
    let call = 0;
    setConvoPromptBudgetTestExtra(() => {
      call += 1;
      return 'GROW ' + 'x'.repeat(call * 40);
    });
    try {
      const tokens = await playFreeBudgetTurns(30);
      assert.equal(tokens.length, 30);
      assert.equal(budgetOk(tokens[2]!, tokens[29]!), false);
    } finally {
      setConvoPromptBudgetTestExtra(null);
    }
  });
});

describe('v2 free chat · catalogue', () => {
  it('start seeds suggested words from the topic word set', async () => {
    const file = loadFreeTopicsFile();
    const comida = file.topics.find((t) => t.id === 'comida')!;
    const threads = loadThreadTopic('comida');
    assert.equal(threads.threads.length, 5);
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'u-sw',
      topicId: 'comida',
      store,
      newId: () => 'sw-sess',
    });
    assert.ok(started.session.suggested_words.length <= 15);
    assert.ok(
      started.session.suggested_words.every((w) =>
        comida.word_set.includes(w),
      ),
    );
  });
});
