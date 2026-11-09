import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ensureGeneratedGoalBankMemory,
  extractTopicLabel,
  resetMemoryGoalBanks,
  topicSlugFromLabel,
} from '@/lib/v2/convo/goals';
import {
  MemoryConvoSessionStore,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';
import {
  createStubConvoStreamModel,
  runFreeConvoTurn,
  type ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn';

describe('conversations v3 V7 generated goals', () => {
  it('extracts topic from Quero falar de…', () => {
    assert.equal(
      extractTopicLabel('Quero falar de carros'),
      'carros',
    );
    assert.equal(topicSlugFromLabel('carros'), 'carros');
  });

  it('caches generated goals for a second caller', async () => {
    resetMemoryGoalBanks();
    let calls = 0;
    const generator = async () => {
      calls += 1;
      const { stubGenerateGoals } = await import('@/lib/v2/convo/goals');
      return stubGenerateGoals({
        topicSlug: 'carros',
        topicLabel: 'carros',
      });
    };
    const first = await ensureGeneratedGoalBankMemory({
      topicLabel: 'carros',
      generator,
    });
    assert.equal(first.fromCache, false);
    assert.equal(first.bank.goals.length, 5);
    const second = await ensureGeneratedGoalBankMemory({
      topicLabel: 'carros',
      generator,
    });
    assert.equal(second.fromCache, true);
    assert.equal(calls, 1);
  });

  it('open turn on Quero falar de carros attaches goals', async () => {
    resetMemoryGoalBanks();
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'v7-u',
      topicId: 'open',
      store,
      newId: () => 'v7-sess',
      learnerName: 'Omar',
    });
    assert.equal(started.session.goals.length, 0);

    const events: ConvoTurnStreamEvent[] = [];
    const model = createStubConvoStreamModel({
      byCandidate: () =>
        'Fixe! Gostas de carros rápidos?\nAR: رائع!\nGOALS: -',
    });
    const { session } = await runFreeConvoTurn({
      session: started.session,
      learnerText: 'Quero falar de carros',
      store,
      model,
      emit: (e) => events.push(e),
    });
    assert.equal(session.goals.length, 5);
    assert.ok(session.current_goal?.startsWith('carros.'));
    assert.ok(events.some((e) => e.type === 'question'));
  });
});
