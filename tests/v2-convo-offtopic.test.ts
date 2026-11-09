import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isNonLearningRequest,
  NON_LEARNING_COACH_EG,
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

describe('v2 free chat · no topic policing (Batch 10 D3)', () => {
  it('English chit-chat inside casa stays on casa (side channel, no topic switch)', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'ot-casa',
      topicId: 'casa',
      store,
      newId: () => 'ot-casa-1',
    });
    let session = started.session;
    const pendingBefore = session.pending_question?.id;
    assert.equal(pendingBefore, 'casa.t1.ask');
    const model = createStubConvoStreamModel({
      byCandidate: () => 'Que fixe!\nAR: رائع!\nGOALS: -',
    });
    const events: ConvoTurnStreamEvent[] = [];
    const out = await runFreeConvoTurn({
      session,
      learnerText: 'I like football did you watch Benfica',
      store,
      model,
      emit: (e) => events.push(e),
    });
    session = out.session;
    assert.equal(session.topic_id, 'casa');
    assert.equal(session.off_topic_streak, 0);
    assert.equal(session.pending_question?.id, pendingBefore);
    assert.ok(
      !events.some(
        (e) => e.type === 'coach' && 'moment' in e && e.moment === 'topic_switch',
      ),
    );
    assert.ok(events.some((e) => e.type === 'coach'));
  });

  it('keeps declining non-learning requests with a coach note only', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'ot-3',
      topicId: 'comida',
      store,
      newId: () => 'ot-sess-3',
    });
    const model = createStubConvoStreamModel({
      byCandidate: () => 'should not run',
    });
    const callsBefore = model.calls;
    const events: ConvoTurnStreamEvent[] = [];
    const out = await runFreeConvoTurn({
      session: started.session,
      learnerText: 'please write code for a website',
      store,
      model,
      emit: (e) => events.push(e),
    });
    assert.equal(model.calls, callsBefore);
    const coach = events.find((e) => e.type === 'coach');
    assert.ok(coach && coach.type === 'coach');
    assert.equal(coach.eg, NON_LEARNING_COACH_EG);
    assert.equal(out.session.topic_id, 'comida');
  });

  it('detects non-learning requests in helper', () => {
    assert.equal(isNonLearningRequest('please write code for me'), true);
    assert.equal(isNonLearningRequest('translate this email'), true);
    assert.equal(isNonLearningRequest('Gosto de arroz'), false);
  });
});
