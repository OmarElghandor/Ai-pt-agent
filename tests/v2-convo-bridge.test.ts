import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifySideChannel,
  drainMemoryTopicRequests,
  matchTopicRequest,
  topicRequestCoachEg,
} from '@/lib/v2/convo/sideChannel';
import {
  freeTopicIdForPack,
  loadTopicsFile,
} from '@/lib/v2/convo/topics';
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

const pack = requireConvoPack('pt-PT.day-18', {
  itemSurfaces: loadConvoItemSurfaces(),
});

describe('v2 free chat · topic request (T7.5)', () => {
  it('classifies عايز أتعلم as topic_request', () => {
    assert.equal(
      classifySideChannel('عايز أتعلم الاتجاهات'),
      'topic_request',
    );
  });

  it('matches directions from the topics catalogue', () => {
    const matched = matchTopicRequest('عايز أتعلم الاتجاهات');
    assert.ok(matched);
    assert.equal(matched!.pack_id, 'pt-PT.day-18');
    const coach = topicRequestCoachEg(matched);
    assert.match(coach.eg, /الاتجاهات|المترو/);
    assert.ok(coach.href?.includes('talk'));
  });

  it('logs unmatched requests in memory', async () => {
    drainMemoryTopicRequests();
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'br-1',
      topicId: 'food',
      store,
      newId: () => 'br-sess-1',
    });
    const model = createStubConvoStreamModel({
      byCandidate: () => 'nope',
    });
    const events: ConvoTurnStreamEvent[] = [];
    await runFreeConvoTurn({
      session: started.session,
      learnerText: 'عايز أتعلم الكاراتيه الفضائي',
      store,
      model,
      emit: (e) => events.push(e),
    });
    const logged = drainMemoryTopicRequests();
    assert.equal(logged.length, 1);
    assert.match(logged[0]!.query_eg, /كاراتيه/);
    assert.ok(
      events.some(
        (e) => e.type === 'coach' && e.id === 'free_topic_request_unmatched',
      ),
    );
  });

  it('pauses free chat and points at the directions pack', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'br-2',
      topicId: 'food',
      store,
      newId: () => 'br-sess-2',
    });
    const pendingBefore = started.session.pending_question?.id;
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
    assert.equal(out.session.paused_for_pack_id, 'pt-PT.day-18');
    assert.equal(out.session.pending_question?.id, pendingBefore);
    assert.ok(
      events.some(
        (e) => e.type === 'coach' && String(e.id).startsWith('open_pack:'),
      ),
    );
  });
});

describe('v2 free chat · lesson→free bridge (T7.5)', () => {
  it('maps day-18 pack to free topic home', () => {
    assert.equal(freeTopicIdForPack('pt-PT.day-18'), 'home');
    const file = loadTopicsFile();
    const topic = file.themes
      .flatMap((t) => t.topics)
      .find((t) => t.id === 'directions.day-18');
    assert.equal(topic?.free_topic_id, 'home');
    assert.ok(pack.bridge.tl.length > 0);
  });

  it('free → directions lesson → back to free restores pending', async () => {
    const store = new MemoryConvoSessionStore();

    // 1. Start free chat
    const freeStart = await startFreeConvoSession({
      userId: 'loop-u',
      topicId: 'food',
      store,
      newId: () => 'loop-free',
    });
    const pendingFree = freeStart.session.pending_question?.id;
    assert.ok(pendingFree);

    // 2. Topic request pauses free
    const model = createStubConvoStreamModel({
      byCandidate: () => 'Ok!',
    });
    const paused = await runFreeConvoTurn({
      session: freeStart.session,
      learnerText: 'عايز أتعلم الاتجاهات',
      store,
      model,
      emit: () => {},
    });
    assert.equal(paused.session.paused_for_pack_id, 'pt-PT.day-18');

    // 3. Start lesson conversation (directions)
    const lesson = await startConvoSession({
      userId: 'loop-u',
      pack,
      store,
      newId: () => 'loop-lesson',
    });
    assert.equal(lesson.session.module, 'lesson');
    assert.equal(lesson.session.pack_id, 'pt-PT.day-18');

    // Mark lesson done (simulate end)
    const doneLesson = {
      ...lesson.session,
      status: 'done' as const,
      phase: 'closing' as const,
    };
    await store.save(doneLesson);

    // 4. Resume free chat — same pending angle, pause cleared
    const resumed = await startFreeConvoSession({
      userId: 'loop-u',
      topicId: 'food',
      store,
    });
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.session.pending_question?.id, pendingFree);
    assert.equal(resumed.session.paused_for_pack_id, null);
    assert.ok(resumed.reopening);
  });
});
