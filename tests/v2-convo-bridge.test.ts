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

  it('matches directions from the topics catalogue', () => {
    const matched = matchTopicRequest('عايز أتعلم الاتجاهات');
    assert.ok(matched);
    assert.equal(matched!.pack_id, 'pt-PT.day-18');
    const coach = topicRequestCoachEg(matched);
    assert.match(coach.eg, /الاتجاهات|المترو/);
    assert.ok(coach.href?.includes('talk'));
  });

  it('matches directions for unhamzed عايز اعلم عن الاتجاهات (E1)', () => {
    const matched = matchTopicRequest('عايز اعلم عن الاتجاهات');
    assert.ok(matched);
    assert.equal(matched!.pack_id, 'pt-PT.day-18');
    assert.equal(classifySideChannel('عايز اعلم عن الاتجاهات'), 'topic_request');
  });

  it('logs unmatched requests in memory', async () => {
    drainMemoryTopicRequests();
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'br-1',
      topicId: 'comida',
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

  it('keeps free chat open and emits a soft Learn CTA (batch 10)', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'br-2',
      topicId: 'comida',
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
    // Soft CTA only — no forced pack jump
    assert.equal(out.session.paused_for_pack_id, null);
    assert.equal(out.session.pending_question?.id, pendingBefore);
    assert.equal(out.session.learn_suggest_done, true);
    assert.ok(
      events.some(
        (e) => e.type === 'coach' && e.id === 'free_topic_request',
      ),
    );
    const cta = events.find((e) => e.type === 'cta');
    assert.ok(cta && cta.type === 'cta');
    assert.equal(cta.label_eg, 'يلا نتعلّم');
    assert.ok(cta.href.includes('talk'));
    assert.equal(cta.dismiss_eg, 'لأ، نكمّل');
  });
});

describe('v2 free chat · lesson→free bridge (T7.5)', () => {
  it('maps day-18 pack to free topic casa', () => {
    assert.equal(freeTopicIdForPack('pt-PT.day-18'), 'casa');
    const file = loadTopicsFile();
    const topic = file.themes
      .flatMap((t) => t.topics)
      .find((t) => t.id === 'directions.day-18');
    assert.equal(topic?.free_topic_id, 'casa');
    assert.ok(pack.bridge.tl.length > 0);
  });

  it('soft Learn CTA leaves free session resumable without pause', async () => {
    const store = new MemoryConvoSessionStore();

    const freeStart = await startFreeConvoSession({
      userId: 'loop-u',
      topicId: 'comida',
      store,
      newId: () => 'loop-free',
    });
    const pendingFree = freeStart.session.pending_question?.id;
    assert.ok(pendingFree);

    const model = createStubConvoStreamModel({
      byCandidate: () => 'Ok!',
    });
    const afterSuggest = await runFreeConvoTurn({
      session: freeStart.session,
      learnerText: 'عايز أتعلم الاتجاهات',
      store,
      model,
      emit: () => {},
    });
    assert.equal(afterSuggest.session.paused_for_pack_id, null);
    assert.equal(afterSuggest.session.learn_suggest_done, true);

    // Learner can still open the directions lesson separately
    const lesson = await startConvoSession({
      userId: 'loop-u',
      pack,
      store,
      newId: () => 'loop-lesson',
    });
    assert.equal(lesson.session.module, 'lesson');
    assert.equal(lesson.session.pack_id, 'pt-PT.day-18');

    const doneLesson = {
      ...lesson.session,
      status: 'done' as const,
      phase: 'closing' as const,
    };
    await store.save(doneLesson);

    const resumed = await startFreeConvoSession({
      userId: 'loop-u',
      topicId: 'comida',
      store,
    });
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.session.pending_question?.id, pendingFree);
    assert.equal(resumed.session.paused_for_pack_id, null);
    assert.ok(resumed.reopening);
  });
});
