import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildConvoPrompt,
  setConvoPromptBudgetTestExtra,
} from '@/lib/v2/convo/prompt';
import {
  endsWithQuestionOrInvitation,
  parseFreeConvoReaction,
} from '@/lib/v2/convo/output';
import {
  MemoryConvoSessionStore,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';
import {
  createStubConvoStreamModel,
  runFreeConvoTurn,
  type ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn';
import { loadTopicAngles, loadFreeTopicsFile } from '@/lib/v2/convo/topics';

describe('v2 free chat · T7.2 prompt', () => {
  it('builds six parts with suggested words and facts inside 2/4 only', () => {
    const built = buildConvoPrompt({
      module: 'free',
      pack: null,
      freeTopicTitle: 'Comida',
      facts: ['likes rice'],
      suggestedWords: ['arroz', 'frango'],
      event: {
        verdict: 'correct',
        item_id: '',
        question_id: 'food.a01',
        question_kind: 'open',
        phase: 'teaching',
      },
      eventLine: 'learner replied',
      candidates: [
        {
          id: 'food.a01',
          tl: 'Gosta de cozinhar?',
          item_id: 'food.a01',
          qkind: 'open',
        },
        {
          id: 'food.a02',
          tl: 'O que come?',
          item_id: 'food.a02',
          qkind: 'open',
        },
      ],
      lastExchanges: [{ role: 'learner', tl: 'Sim' }],
      learnerAnswer: 'Sim',
    });
    assert.equal(built.parts.length, 6);
    assert.match(built.parts[1]!.text, /Comida/);
    assert.match(built.parts[1]!.text, /likes rice/);
    assert.match(built.parts[3]!.text, /Prefer these words: arroz, frango/);
    assert.doesNotMatch(built.assembled, /accepted forms|coach bank|يعني/);
  });
});

describe('v2 free chat · parseFree', () => {
  it('keeps trailing questions', () => {
    const p = parseFreeConvoReaction('Que bom! E tu?');
    assert.equal(p.decision, 'ok');
    assert.match(p.reaction, /\?/);
    assert.equal(endsWithQuestionOrInvitation(p.reaction), true);
  });
});

describe('v2 free chat · 30-turn never ends without a question', () => {
  it('appends next angle when the model omits a question', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'free-u1',
      topicId: 'food',
      store,
      newId: () => 'free-sess-1',
    });
    let session = started.session;
    assert.equal(session.module, 'free');
    assert.ok(session.pending_question);

    // Stub never ends with ? → code must append angle
    const model = createStubConvoStreamModel({
      byCandidate: () => 'Que interessante!',
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
      const q = events.filter((e) => e.type === 'question');
      assert.ok(q.length >= 1, `turn ${i + 1} missing question event`);
      const lastQ = q[q.length - 1]!;
      assert.ok(
        lastQ.type === 'question' &&
          (lastQ.tl.includes('?') || endsWithQuestionOrInvitation(lastQ.tl)),
        `turn ${i + 1} question text: ${lastQ.type === 'question' ? lastQ.tl : ''}`,
      );
    }
  });
});

describe('v2 free chat · budget (T7.2 / T2.2 free run)', () => {
  async function playFreeBudgetTurns(n: number): Promise<number[]> {
    const inputTokens: number[] = [];
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'free-budget',
      topicId: 'food',
      store,
      newId: () => 'free-budget-sess',
    });
    let session = started.session;
    const model = createStubConvoStreamModel({
      byCandidate: () => 'Bom! E depois?',
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
    const food = file.topics.find((t) => t.id === 'food')!;
    const angles = loadTopicAngles('food');
    assert.ok(angles.angles.length >= 8);
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'u-sw',
      topicId: 'food',
      store,
      newId: () => 'sw-sess',
    });
    assert.ok(started.session.suggested_words.length <= 15);
    assert.ok(
      started.session.suggested_words.every((w) =>
        food.word_set.includes(w),
      ),
    );
  });
});
