import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { freeTopicById } from '@/lib/v2/convo/topics';
import {
  MemoryConvoSessionStore,
  createFreeConvoSessionDoc,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';

describe('conversations v3 V2 session state', () => {
  it('topic session seeds goals, current_goal, scene', () => {
    const topic = freeTopicById('casa')!;
    const session = createFreeConvoSessionDoc({
      id: 'v2-casa',
      userId: 'u1',
      topic,
    });
    assert.ok(session.goals.length >= 5);
    assert.ok(session.goals.every((g) => g.status === 'open'));
    assert.equal(session.current_goal, session.goals[0]?.id);
    assert.equal(session.turns_on_goal, 0);
    assert.equal(session.scene?.character_id, 'ines');
    assert.ok(session.pending_frame?.chips?.length);
    assert.equal(session.lesson_day, null);
  });

  it('day 1 open session loads lesson goals', async () => {
    const store = new MemoryConvoSessionStore();
    const result = await startFreeConvoSession({
      userId: 'u-day1',
      topicId: 'open',
      store,
      lessonDay: 1,
      newId: () => 'v2-day1',
      learnerName: 'Omar',
    });
    assert.equal(result.session.lesson_day, 1);
    const ids = result.session.goals.map((g) => g.id);
    assert.ok(ids.includes('day.greet'));
    assert.ok(ids.includes('day.name'));
    assert.equal(result.session.current_goal, 'day.greet');
    assert.equal(result.session.scene?.time_of_day, 'morning');
    assert.equal(result.session.scene?.character_id, 'ines');
  });
});
