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
      topicId: 'food',
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
      learnerText: 'Gosto de cozinhar em casa.',
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
  it('leave and return continues on the same angle', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'resume-u',
      topicId: 'food',
      store,
      newId: () => 'resume-sess',
    });
    let session = started.session;
    const model = createStubConvoStreamModel({
      byCandidate: () => 'Ok!',
    });
    // One turn advances angle; keep pending from session
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
    const angleIndex = session.angle_index;

    // Simulate leave + reopen (same store, like after browser return)
    const resumed = await startFreeConvoSession({
      userId: 'resume-u',
      topicId: 'food',
      store,
    });
    assert.equal(resumed.resumed, true);
    assert.ok(resumed.reopening);
    assert.equal(resumed.session.pending_question?.id, pendingId);
    assert.equal(resumed.session.angle_index, angleIndex);
    assert.match(resumed.reopening!.character_tl, /Estávamos a falar|Falávamos|Sobre/);
    assert.match(resumed.reopening!.character_tl, /comida|Comida/i);
  });
});
