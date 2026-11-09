import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifySideChannel } from '@/lib/v2/convo/sideChannel';
import {
  freeTopicIdForPack,
  loadTopicsFile,
} from '@/lib/v2/convo/topics';
import { OPEN_TOPIC_ID } from '@/lib/v2/convo/topics/openTopic';
import {
  MemoryConvoSessionStore,
  startConvoSession,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';
import {
  loadConvoItemSurfaces,
  requireConvoPack,
} from '@/lib/v2/convo/pack';
import {
  createStubConvoStreamModel,
  runFreeConvoTurn,
  type ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn';

const pack = requireConvoPack('pt-PT.day-33', {
  itemSurfaces: loadConvoItemSurfaces(),
});

function hasCta(events: ConvoTurnStreamEvent[]): boolean {
  return events.some((e) => String(e.type).startsWith('cta'));
}

describe('v2 free chat · topic request (T7.5)', () => {
  it('classifies عايز أتعلم as topic_request', () => {
    assert.equal(
      classifySideChannel('عايز أتعلم الاتجاهات'),
      'topic_request',
    );
  });

  it('classifies wide Arabic learn phrasings as topic_request (E1)', () => {
    const phrasings = [
      'عايز أتعلم الاتجاهات',
      'عايز اعلم عن الاتجاهات',
      'عاوز اتعلم الاتجاهات',
      'علمني الاتجاهات',
      'علّمني الاتجاهات',
      'عايز أفهم الاتجاهات',
      'عايز أعرف أقول الاتجاهات',
      'محتاج أتعلم الاتجاهات',
      'نفسي أتعلم الاتجاهات',
      'فهمني الاتجاهات',
      'إزاي أقول الاتجاهات',
    ];
    for (const p of phrasings) {
      assert.equal(
        classifySideChannel(p),
        'topic_request',
        `expected topic_request for: ${p}`,
      );
    }
    // Language question about a word stays language_question (not a topic title)
    assert.equal(classifySideChannel('ازاي أقول شمال؟'), 'language_question');
    assert.equal(classifySideChannel('ازاي أقول مع رز؟'), 'language_question');
  });

  it('routes عايز أتعلم الاتجاهات to direcoes with no CTA', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'br-2',
      topicId: OPEN_TOPIC_ID,
      store,
      learnerLevel: 1,
      newId: () => 'br-sess-2',
    });
    const model = createStubConvoStreamModel({
      byCandidate: () => 'nope',
    });
    const events: ConvoTurnStreamEvent[] = [];
    const out = await runFreeConvoTurn({
      session: started.session,
      learnerText: 'عايز أتعلم الاتجاهات',
      store,
      model,
      emit: (e) => events.push(e),
    });
    assert.equal(out.session.topic_id, 'direcoes');
    assert.equal(out.session.topic_locked, true);
    assert.equal(out.session.paused_for_pack_id, null);
    assert.ok(events.some((e) => e.type === 'topic_lock'));
    assert.ok(!hasCta(events));
  });

  it('routes unhamzed عايز اعلم عن الاتجاهات to direcoes (E1)', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'br-e1',
      topicId: OPEN_TOPIC_ID,
      store,
      learnerLevel: 1,
      newId: () => 'br-e1',
    });
    const events: ConvoTurnStreamEvent[] = [];
    const out = await runFreeConvoTurn({
      session: started.session,
      learnerText: 'عايز اعلم عن الاتجاهات',
      store,
      model: createStubConvoStreamModel({ byCandidate: () => 'Ok!' }),
      emit: (e) => events.push(e),
    });
    assert.equal(classifySideChannel('عايز اعلم عن الاتجاهات'), 'topic_request');
    assert.equal(out.session.topic_id, 'direcoes');
    assert.ok(!hasCta(events));
  });

  it('unknown topic request clarifies without Learn CTA', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'br-1',
      topicId: OPEN_TOPIC_ID,
      store,
      learnerLevel: 1,
      newId: () => 'br-sess-1',
    });
    const events: ConvoTurnStreamEvent[] = [];
    const out = await runFreeConvoTurn({
      session: started.session,
      learnerText: 'عايز أتعلم الكاراتيه الفضائي',
      store,
      model: createStubConvoStreamModel({ byCandidate: () => 'nope' }),
      emit: (e) => events.push(e),
    });
    assert.ok(!hasCta(events));
    assert.equal(out.session.topic_locked, false);
    assert.ok(
      events.some(
        (e) =>
          e.type === 'question' ||
          (e.type === 'coach' && e.id === 'topic_reask'),
      ),
    );
  });
});

describe('v2 free chat · lesson→free bridge (T7.5)', () => {
  it('maps day-33 pack to free topic casa', () => {
    assert.equal(freeTopicIdForPack('pt-PT.day-33'), 'casa');
    const file = loadTopicsFile();
    const topic = file.themes
      .flatMap((t) => t.topics)
      .find((t) => t.id === 'directions.day-33');
    assert.equal(topic?.free_topic_id, 'casa');
    assert.ok(pack.bridge.tl.length > 0);
  });

  it('topic lock does not block starting a role-play lesson', async () => {
    const store = new MemoryConvoSessionStore();

    const freeStart = await startFreeConvoSession({
      userId: 'loop-u',
      topicId: OPEN_TOPIC_ID,
      store,
      learnerLevel: 1,
      newId: () => 'loop-free',
    });

    const afterLock = await runFreeConvoTurn({
      session: freeStart.session,
      learnerText: 'عايز أتعلم الاتجاهات',
      store,
      model: createStubConvoStreamModel({ byCandidate: () => 'Ok!' }),
      emit: () => {},
    });
    assert.equal(afterLock.session.topic_id, 'direcoes');
    assert.equal(afterLock.session.paused_for_pack_id, null);

    const lesson = await startConvoSession({
      userId: 'loop-u',
      pack,
      store,
      newId: () => 'loop-lesson',
    });
    assert.equal(lesson.session.module, 'lesson');
    assert.equal(lesson.session.pack_id, 'pt-PT.day-33');
  });
});
