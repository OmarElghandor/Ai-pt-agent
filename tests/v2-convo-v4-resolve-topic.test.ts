import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MemoryConvoSessionStore,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';
import {
  createStubConvoStreamModel,
  runFreeConvoTurn,
} from '@/lib/v2/convo/turn';
import {
  freeTopicById,
  OPEN_TOPIC_ID,
  resolveFreeTopic,
} from '@/lib/v2/convo/topics';

describe('conversations v4 · unify free topic resolver', () => {
  it('resolves open, thread, authored topic, and day-1', () => {
    assert.equal(resolveFreeTopic('open')?.id, OPEN_TOPIC_ID);
    assert.equal(freeTopicById('casa')?.character_id, 'ines');

    const direcoes = freeTopicById('direcoes');
    assert.ok(direcoes, 'direcoes authored bank must resolve');
    assert.equal(direcoes.title_ar, 'الاتجاهات');
    assert.equal(direcoes.character_id, 'ines');
    assert.match(direcoes.intro_eg, /Inês|بيت/);

    const day1 = freeTopicById('day-1');
    assert.ok(day1, 'day-1 lesson bank must resolve');
    assert.ok(day1.title_tl || day1.title_ar);
  });

  it('start + turn with locked direcoes does not throw (no injected topic)', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'resolve-direcoes',
      topicId: OPEN_TOPIC_ID,
      store,
      learnerLevel: 1,
      newId: () => 'resolve-direcoes-session',
      learnerName: 'Omar',
    });
    let session = started.session;
    assert.equal(session.topic_id, OPEN_TOPIC_ID);

    const events: unknown[] = [];
    const out = await runFreeConvoTurn({
      session,
      learnerText: 'عايز أتكلم عن الاتجاهات',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () => 'Ok!\nAR: حسناً!\nGOALS: -',
      }),
      emit: (e) => events.push(e),
    });
    session = out.session;
    assert.equal(session.topic_id, 'direcoes');
    assert.equal(session.topic_locked, true);

    // Second turn must resolve direcoes via freeTopicById — no input.topic.
    const out2 = await runFreeConvoTurn({
      session,
      learnerText: 'De metro.',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () =>
          'Ótimo!\nAR: ممتاز!\nGOALS: dir.metro',
      }),
      emit: (e) => events.push(e),
    });
    assert.equal(out2.session.topic_id, 'direcoes');
    assert.ok(
      freeTopicById(out2.session.topic_id!) != null,
      'locked topic still resolvable',
    );
  });
});
