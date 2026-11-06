import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fitFrameFromArabic, handleFreeArabicSide } from '@/lib/v2/convo/free';
import {
  collectFreeContextCandidates,
  createStubConvoCoachCaller,
  matchContextLine,
} from '@/lib/v2/convo/sideChannel';
import { loadThreadTopic } from '@/lib/v2/convo/topics';
import {
  MemoryConvoSessionStore,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';
import {
  createStubConvoStreamModel,
  runFreeConvoTurn,
  type ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn';

describe('v2 free chat · C7/C8 side channel + frame', () => {
  it('fits ساكن في أمادورا to casa.t1 chip', () => {
    const doc = loadThreadTopic('casa');
    const frame = doc.threads[0]!.ask.frame;
    const fitted = fitFrameFromArabic('ساكن في أمادورا', frame);
    assert.equal(fitted, 'Moro em Amadora.');
  });

  it('ازاي أقول مع رز؟ coach returns com arroz', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'side-u',
      topicId: 'comida',
      store,
      newId: () => 'side-sess',
    });
    const model = createStubConvoStreamModel({
      byCandidate: () => 'should not run',
    });
    const events: ConvoTurnStreamEvent[] = [];
    const callsBefore = model.calls;
    await runFreeConvoTurn({
      session: started.session,
      learnerText: 'ازاي أقول مع رز؟',
      store,
      model,
      emit: (e) => events.push(e),
      coachCaller: async () => ({
        eg: 'قول «com arroz» — جرّب تقولها',
        timedOut: false,
      }),
    });
    assert.equal(model.calls, callsBefore);
    const coach = events.find((e) => e.type === 'coach');
    assert.ok(coach && coach.type === 'coach');
    assert.match(coach.eg, /com arroz/);
    assert.equal(
      events.some((e) => e.type === 'authored_append' || e.type === 'question'),
      false,
    );
  });

  it('ساكن في أمادورا on casa.t1 uses frame without advancing', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'side-u2',
      topicId: 'casa',
      store,
      newId: () => 'side-sess-2',
    });
    const pendingBefore = started.session.pending_question?.id;
    const events: ConvoTurnStreamEvent[] = [];
    await runFreeConvoTurn({
      session: started.session,
      learnerText: 'ساكن في أمادورا',
      store,
      model: createStubConvoStreamModel({ byCandidate: () => 'nope' }),
      emit: (e) => events.push(e),
    });
    const coach = events.find((e) => e.type === 'coach');
    assert.ok(coach && coach.type === 'coach');
    assert.match(coach.eg, /Moro em Amadora/);
    const saved = await store.findById('side-sess-2');
    assert.equal(saved?.pending_question?.id, pendingBefore);
  });

  it('handleFreeArabicSide frame path emits coach only', async () => {
    const events: ConvoTurnStreamEvent[] = [];
    await handleFreeArabicSide({
      kind: 'arabic_answer',
      learnerText: 'ساكن في أمادورا',
      frame: loadThreadTopic('casa').threads[0]!.ask.frame,
      emit: (e) => events.push(e),
    });
    assert.equal(events.length, 1);
    assert.equal(events[0]!.type, 'coach');
  });

  it('S3 · ginasio context match without coach model', async () => {
    const doc = loadThreadTopic('ginasio');
    const thread = doc.threads[0]!;
    const candidates = collectFreeContextCandidates({
      share: thread.share,
      ask: thread.ask,
      followUps: thread.follow_ups,
      frame: thread.ask.frame,
    });
    const hit = matchContextLine('ازاي اقول بتمرن ٣ مرات?', candidates);
    assert.ok(hit);
    assert.match(hit.tl, /três vezes|ginasio|ginásio|Treino/i);

    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 's3-u',
      topicId: 'ginasio',
      store,
      newId: () => 's3-ginasio',
    });
    const coach = createStubConvoCoachCaller({
      eg: 'should not be used',
    });
    const events: ConvoTurnStreamEvent[] = [];
    const model = createStubConvoStreamModel({
      byCandidate: () => 'should not run',
    });
    const callsBefore = model.calls;
    await runFreeConvoTurn({
      session: started.session,
      learnerText: 'ازاي اقول بتمرن ٣ مرات?',
      store,
      model,
      emit: (e) => events.push(e),
      coachCaller: coach,
    });
    assert.equal(model.calls, callsBefore);
    assert.equal(coach.calls, 0, 'S3 must not call the coach model');
    const note = events.find((e) => e.type === 'coach');
    assert.ok(note && note.type === 'coach');
    assert.match(note.eg, /Vou ao ginásio três vezes|Treino três vezes/i);
    assert.match(note.eg, /Tiago|زي ما/);
  });

  it('S5 · coach timeout still uses S3 context answer', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 's5-u',
      topicId: 'ginasio',
      store,
      newId: () => 's5-timeout',
    });
    const coach = createStubConvoCoachCaller({ fail: 'timeout' });
    const events: ConvoTurnStreamEvent[] = [];
    await runFreeConvoTurn({
      session: started.session,
      learnerText: 'ازاي اقول بتمرن ٣ مرات?',
      store,
      model: createStubConvoStreamModel({ byCandidate: () => 'nope' }),
      emit: (e) => events.push(e),
      coachCaller: coach,
    });
    assert.equal(coach.calls, 0, 'S3 hits before the model');
    const note = events.find((e) => e.type === 'coach');
    assert.ok(note && note.type === 'coach');
    assert.match(note.eg, /três vezes|ginásio/i);
    assert.doesNotMatch(note.eg, /مش متأكد من الجملة دي/);
  });

  it('S5 · no context → frame fallback, not old generic', async () => {
    const events: ConvoTurnStreamEvent[] = [];
    const frame = {
      tl: 'Sim, ___. / Não muito.',
      eg: 'بتلعب رياضة؟',
      chips: ['Sim, vou ao ginásio.'],
    };
    await handleFreeArabicSide({
      kind: 'language_question',
      learnerText: 'ازاي اقول حاجة غريبة خالص مش موجودة؟',
      frame,
      context: { candidates: [] },
      emit: (e) => events.push(e),
      coachCaller: createStubConvoCoachCaller({ fail: 'timeout' }),
    });
    const note = events.find((e) => e.type === 'coach');
    assert.ok(note && note.type === 'coach');
    assert.match(note.eg, /تقدر تقول:/);
    assert.match(note.eg, /Sim/);
    assert.doesNotMatch(
      note.eg,
      /جرّب تقولها بالبرتغالي — لو مش متأكد/,
    );
  });
});
