import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  loadConvoItemSurfaces,
  requireConvoPack,
} from '@/lib/v2/convo/pack';
import { setConvoPromptBudgetTestExtra } from '@/lib/v2/convo/prompt';
import {
  MemoryConvoSessionStore,
  startConvoSession,
  type ConvoSession,
} from '@/lib/v2/convo/session';
import {
  createStubConvoStreamModel,
  runConvoTurn,
  type ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn';
import { surfaceTl } from './fixtures/convo/day18-script';

const pack = requireConvoPack('pt-PT.day-18', {
  itemSurfaces: loadConvoItemSurfaces(),
});
const surfaces = loadConvoItemSurfaces();

/** Cycle: correct, wrong direction, unclear, off-topic, Arabic. */
const MIXED: string[] = [
  '__correct__',
  'esquerda',
  'asdfqwerzzz',
  'hello how are you',
  'يمين',
];

function learnerForTurn(turnIndex: number, session: ConvoSession): string {
  const kind = MIXED[turnIndex % MIXED.length];
  if (kind === '__correct__') {
    const pending = session.pending_question;
    if (pending) return surfaceTl(pending.item_id);
    return 'ok';
  }
  return kind;
}

/**
 * Play `n` model-backed turns on day 18 (restart a session if one ends early).
 * Returns input_tokens per turn (index 0 = turn 1).
 */
async function playBudgetTurns(n: number): Promise<number[]> {
  const inputTokens: number[] = [];
  let sessionNum = 0;

  while (inputTokens.length < n) {
    sessionNum += 1;
    const store = new MemoryConvoSessionStore();
    const started = await startConvoSession({
      userId: `budget-${sessionNum}`,
      pack,
      store,
      newId: () => `budget-sess-${sessionNum}`,
    });
    let session = started.session;
    const model = createStubConvoStreamModel({
      byCandidate: (ids) => `[${ids[0]}] Ok!`,
    });

    {
      const events: ConvoTurnStreamEvent[] = [];
      const out = await runConvoTurn({
        session,
        pack,
        surfaces,
        learnerText: '',
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

    let guard = 0;
    while (
      inputTokens.length < n &&
      session.status !== 'done' &&
      guard < n + 5
    ) {
      guard += 1;
      if (!session.pending_question) break;
      const text = learnerForTurn(inputTokens.length, session);
      const events: ConvoTurnStreamEvent[] = [];
      const out = await runConvoTurn({
        session,
        pack,
        surfaces,
        learnerText: text,
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
  }

  return inputTokens.slice(0, n);
}

function budgetOk(turn3: number, turn40: number): boolean {
  return turn40 <= turn3 * 1.1;
}

describe('v2 convo · 40-turn budget (T2.2)', () => {
  it('turn 40 input tokens stay within 10% of turn 3', async () => {
    setConvoPromptBudgetTestExtra(null);
    try {
      const tokens = await playBudgetTurns(40);
      assert.equal(tokens.length, 40);
      const turn3 = tokens[2];
      const turn40 = tokens[39];
      assert.ok(turn3 > 0, `turn 3 tokens=${turn3}`);
      assert.ok(turn40 > 0, `turn 40 tokens=${turn40}`);
      assert.ok(
        budgetOk(turn3, turn40),
        `budget blown: turn3=${turn3} turn40=${turn40} (limit ${turn3 * 1.1})`,
      );
    } finally {
      setConvoPromptBudgetTestExtra(null);
    }
  });

  it('fails the same check when a growing line is added to the prompt', async () => {
    let call = 0;
    setConvoPromptBudgetTestExtra(() => {
      call += 1;
      // Grows every build so later turns exceed turn 3 by >10%.
      return 'GROW ' + 'x'.repeat(call * 40);
    });
    try {
      const tokens = await playBudgetTurns(40);
      assert.equal(tokens.length, 40);
      const turn3 = tokens[2];
      const turn40 = tokens[39];
      assert.equal(
        budgetOk(turn3, turn40),
        false,
        `expected intentional fail: turn3=${turn3} turn40=${turn40}`,
      );
    } finally {
      setConvoPromptBudgetTestExtra(null);
    }
  });
});
