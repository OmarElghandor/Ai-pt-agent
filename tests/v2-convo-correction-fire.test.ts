import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  matchesAcceptedForm,
  shouldFireFreeTextCorrection,
} from '@/lib/v2/convo/correction';
import { createStubFreeTextGrader } from '@/lib/v2/grader';
import {
  MemoryConvoSessionStore,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';
import {
  createStubConvoStreamModel,
  runFreeConvoTurn,
  type ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn';

describe('v2 convo · correction fire (K2)', () => {
  it('shouldFire skips assisted, side-channel, short exact chips', () => {
    assert.equal(
      shouldFireFreeTextCorrection({ learnerText: 'Eu prefiro' }),
      true,
    );
    assert.equal(
      shouldFireFreeTextCorrection({
        learnerText: 'Eu prefiro',
        assisted: true,
      }),
      false,
    );
    assert.equal(
      shouldFireFreeTextCorrection({
        learnerText: 'ازاي اقول',
        sideChannel: true,
      }),
      false,
    );
    assert.equal(
      shouldFireFreeTextCorrection({
        learnerText: 'Sim',
        exactAccepted: true,
      }),
      false,
    );
    assert.ok(matchesAcceptedForm('Sim, vou ao ginásio.', [
      'Sim, vou ao ginásio.',
    ]));
  });

  it('emits correction after character reply; skips Arabic', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'corr-u',
      topicId: 'ginasio',
      store,
      newId: () => 'corr-sess',
    });
    const grader = createStubFreeTextGrader({
      has_error: true,
      severity: 'error',
      corrected_tl: 'Eu prefiro à noite.',
      changes: [{ from: 'Prefero', to: 'prefiro' }],
      main_error: {
        from: 'Prefero',
        to: 'prefiro',
        type: 'grammar/verb_form',
      },
      note_eg: 'بنقول prefiro مش prefero',
      ar: 'أفضل في الليل.',
    });
    const model = createStubConvoStreamModel({
      byCandidate: () => 'À noite, como eu! Porquê?',
    });
    const events: ConvoTurnStreamEvent[] = [];
    await runFreeConvoTurn({
      session: started.session,
      learnerText: 'eu Prefero noite',
      store,
      model,
      emit: (e) => events.push(e),
      learnerTurnId: 'lt-prefero',
      freeTextGrader: grader,
    });
    assert.equal(grader.calls, 1);
    assert.ok(model.calls >= 1);
    const corrIdx = events.findIndex((e) => e.type === 'correction');
    const doneIdx = events.findIndex((e) => e.type === 'done');
    assert.ok(corrIdx >= 0, 'correction event present');
    assert.ok(doneIdx > corrIdx, 'correction before done');
    const corr = events[corrIdx]!;
    assert.ok(corr.type === 'correction');
    assert.equal(corr.learner_turn_id, 'lt-prefero');
    assert.equal(corr.corrected_tl, 'Eu prefiro à noite.');

    // Arabic side channel must not fire grader.
    const storeAr = new MemoryConvoSessionStore();
    const startedAr = await startFreeConvoSession({
      userId: 'corr-ar',
      topicId: 'ginasio',
      store: storeAr,
      newId: () => 'corr-ar-sess',
    });
    const events2: ConvoTurnStreamEvent[] = [];
    const grader2 = createStubFreeTextGrader({
      has_error: true,
      severity: 'error',
      corrected_tl: 'should not emit',
      changes: [],
      main_error: null,
      note_eg: '',
      ar: '',
    });
    await runFreeConvoTurn({
      session: startedAr.session,
      learnerText: 'ازاي اقول بتمرن؟',
      store: storeAr,
      model: createStubConvoStreamModel({ byCandidate: () => 'nope' }),
      emit: (e) => events2.push(e),
      freeTextGrader: grader2,
      coachCaller: async () => ({
        eg: 'قول «treino»',
        timedOut: false,
      }),
    });
    assert.equal(grader2.calls, 0);
    assert.equal(
      events2.some((e) => e.type === 'correction'),
      false,
    );
  });

  it('authored teach advance still emits correction when grader is slow (~3s)', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'corr-teach-slow',
      topicId: 'open',
      store,
      learnerLevel: 1,
      newId: () => 'corr-teach-slow-sess',
      learnerName: 'Omar',
    });
    let session = started.session;
    const lock = await runFreeConvoTurn({
      session,
      learnerText: 'عايز أتكلم عن الاتجاهات',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () => {
          throw new Error('no model');
        },
      }),
      emit: () => {},
    });
    session = lock.session;

    const events: ConvoTurnStreamEvent[] = [];
    session = (
      await runFreeConvoTurn({
        session,
        learnerText: 'De metro.',
        store,
        model: createStubConvoStreamModel({
          byCandidate: () => {
            throw new Error('no model');
          },
        }),
        emit: () => {},
      })
    ).session;

    session = (
      await runFreeConvoTurn({
        session,
        learnerText: 'Estou na estação.',
        store,
        model: createStubConvoStreamModel({
          byCandidate: () => {
            throw new Error('no model');
          },
        }),
        emit: () => {},
      })
    ).session;

    // Keyword hit completes dir.right on authored path; grader is slow (~3s).
    await runFreeConvoTurn({
      session,
      learnerText: 'Para direita',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () => {
          throw new Error('no model on teach');
        },
      }),
      emit: (e) => events.push(e),
      learnerTurnId: 'lt-para-direita',
      freeTextGrader: async () => {
        await new Promise((r) => setTimeout(r, 3_000));
        return {
          has_error: true,
          severity: 'error',
          corrected_tl: 'Para a direita.',
          changes: [{ from: 'Para direita', to: 'Para a direita' }],
          main_error: {
            from: 'Para direita',
            to: 'Para a direita',
            type: 'grammar/preposition',
          },
          note_eg: 'ناقص a قبل direita',
          ar: 'يميناً',
        };
      },
    });

    const corr = events.find((e) => e.type === 'correction');
    assert.ok(corr && corr.type === 'correction', 'slow grader still emits');
    assert.equal(corr.learner_turn_id, 'lt-para-direita');
  });

  it('assisted chip path does not call free-text grader', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'corr-u2',
      topicId: 'ginasio',
      store,
      newId: () => 'corr-assist',
    });
    const grader = createStubFreeTextGrader({
      has_error: true,
      severity: 'error',
      corrected_tl: 'x',
      changes: [],
      main_error: null,
      note_eg: '',
      ar: '',
    });
    await runFreeConvoTurn({
      session: started.session,
      learnerText: 'Sim, vou ao ginásio.',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () => 'Boa! Quantas vezes?',
      }),
      emit: () => {},
      assisted: true,
      freeTextGrader: grader,
    });
    assert.equal(grader.calls, 0);
  });
});
