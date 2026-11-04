import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isNonLearningRequest,
  isOffTopic,
  nearestFreeTopic,
  NON_LEARNING_COACH_EG,
} from '@/lib/v2/convo/free';
import {
  freeTopicById,
  loadFreeTopicsFile,
} from '@/lib/v2/convo/topics';
import {
  MemoryConvoSessionStore,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';
import {
  createStubConvoStreamModel,
  runFreeConvoTurn,
  type ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn';

describe('v2 free chat · off-topic helpers (T7.3)', () => {
  const food = freeTopicById('food')!;

  it('detects football English as off-topic for food', () => {
    assert.equal(
      isOffTopic('I love watching football matches every Sunday', food),
      true,
    );
  });

  it('keeps food words on-topic', () => {
    assert.equal(isOffTopic('Gosto de arroz e frango', food), false);
  });

  it('detects non-learning requests', () => {
    assert.equal(isNonLearningRequest('please write code for me'), true);
    assert.equal(isNonLearningRequest('translate this email'), true);
    assert.equal(isNonLearningRequest('Gosto de arroz'), false);
  });

  it('picks a related nearest topic', () => {
    const all = loadFreeTopicsFile().topics;
    const next = nearestFreeTopic(food, all, 'football stadium weekend');
    assert.notEqual(next.id, food.id);
  });
});

describe('v2 free chat · off-topic turn behaviour (T7.3)', () => {
  it('bridges back on the first English football message', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'ot-1',
      topicId: 'food',
      store,
      newId: () => 'ot-sess-1',
    });
    let session = started.session;
    const pendingBefore = session.pending_question?.id;
    const model = createStubConvoStreamModel({
      byCandidate: () => 'Que interessante!',
    });
    const events: ConvoTurnStreamEvent[] = [];
    const out = await runFreeConvoTurn({
      session,
      learnerText: 'I love watching football matches every Sunday',
      store,
      model,
      emit: (e) => events.push(e),
    });
    session = out.session;
    assert.equal(session.off_topic_streak, 1);
    assert.equal(session.topic_id, 'food');
    const q = events.find((e) => e.type === 'question');
    assert.ok(q && q.type === 'question');
    assert.match(q.tl, /\?/);
    // Still on same topic / same or current angle
    assert.ok(session.pending_question);
    assert.equal(session.topic_id, 'food');
    void pendingBefore;
  });

  it('switches topic on the second consecutive off-topic message', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'ot-2',
      topicId: 'food',
      store,
      newId: () => 'ot-sess-2',
    });
    let session = started.session;
    const model = createStubConvoStreamModel({
      byCandidate: () => 'Ok!',
    });

    {
      const events: ConvoTurnStreamEvent[] = [];
      const out = await runFreeConvoTurn({
        session,
        learnerText: 'I love watching football matches every Sunday',
        store,
        model,
        emit: (e) => events.push(e),
      });
      session = out.session;
      assert.equal(session.off_topic_streak, 1);
    }

    {
      const events: ConvoTurnStreamEvent[] = [];
      const out = await runFreeConvoTurn({
        session,
        learnerText: 'Did you see the premier league goal yesterday?',
        store,
        model,
        emit: (e) => events.push(e),
      });
      session = out.session;
      assert.notEqual(session.topic_id, 'food');
      assert.equal(session.off_topic_streak, 0);
      assert.ok(events.some((e) => e.type === 'coach'));
      assert.ok(events.some((e) => e.type === 'question'));
    }
  });

  it('declines non-learning requests with a coach note only', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'ot-3',
      topicId: 'food',
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
    assert.equal(out.session.topic_id, 'food');
    assert.equal(out.session.angle_index, started.session.angle_index);
  });
});
