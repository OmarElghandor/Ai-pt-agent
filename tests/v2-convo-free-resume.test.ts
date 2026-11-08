import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractFreeFact,
  FREE_FACTS_MAX,
  pushFreeFact,
} from '@/lib/v2/convo/free';
import {
  MemoryConvoSessionStore,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';
import {
  createStubConvoStreamModel,
  runFreeConvoTurn,
  type ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn';

describe('v2 free chat · facts (T7.4)', () => {
  it('extracts a fact from hints in the learner reply', () => {
    assert.equal(
      extractFreeFact({
        learnerText: 'Sim, gosto de arroz.',
        hints: ['arroz', 'frango'],
      }),
      'said arroz',
    );
  });

  it('caps facts at 5, dropping the oldest', () => {
    let facts: string[] = [];
    for (let i = 1; i <= 7; i++) {
      facts = pushFreeFact(facts, `said word${i}`);
    }
    assert.equal(facts.length, FREE_FACTS_MAX);
    assert.equal(facts[0], 'said word3');
    assert.equal(facts[4], 'said word7');
  });

  it('records a fact when an angle closes on a matching reply', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'fact-u',
      topicId: 'comida',
      store,
      newId: () => 'fact-sess',
    });
    let session = started.session;
    const model = createStubConvoStreamModel({
      byCandidate: () => 'Que bom! E depois?',
    });
    const events: ConvoTurnStreamEvent[] = [];
    const out = await runFreeConvoTurn({
      session,
      learnerText: 'É frango com arroz.',
      store,
      model,
      emit: (e) => events.push(e),
    });
    session = out.session;
    assert.ok(session.facts.length >= 1);
    assert.ok(session.facts.some((f) => f.startsWith('said ')));
    assert.ok(session.facts.length <= FREE_FACTS_MAX);
  });
});

describe('v2 free chat · resume (T7.4)', () => {
  it('leave and return continues on the same goal topic', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'resume-u',
      topicId: 'comida',
      store,
      newId: () => 'resume-sess',
    });
    let session = started.session;
    const model = createStubConvoStreamModel({
      byCandidate: () => 'Ok!\nAR: حسناً!\nGOALS: -',
    });
    {
      const out = await runFreeConvoTurn({
        session,
        learnerText: 'Sim.',
        store,
        model,
        emit: () => {},
      });
      session = out.session;
    }
    const pendingId = session.pending_question?.id;
    assert.ok(pendingId);
    assert.equal(session.topic_id, 'comida');

    const resumed = await startFreeConvoSession({
      userId: 'resume-u',
      topicId: 'comida',
      store,
    });
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.session.pending_question?.id, pendingId);
    assert.equal(resumed.session.topic_id, 'comida');
    assert.equal(resumed.session.topic_locked, true);
  });
});
