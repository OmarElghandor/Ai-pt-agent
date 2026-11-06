import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  coachPhrasesEqual,
  consumeCoachPhraseOnLearnerTurn,
  extractCoachPhrase,
  normalizeCoachPhrase,
  setCoachPhrase,
} from '@/lib/v2/convo/free/coachPhrase';
import {
  MemoryConvoSessionStore,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';
import { createStubConvoCoachCaller } from '@/lib/v2/convo/sideChannel';
import {
  createStubConvoStreamModel,
  runFreeConvoTurn,
} from '@/lib/v2/convo/turn';

describe('v2 free · G6 coach phrase', () => {
  it('extracts PT from guillemets and folds accents', () => {
    assert.equal(
      extractCoachPhrase('حلو — بالبرتغالي: «Moro em Amadora». — جرّب تقولها'),
      'Moro em Amadora',
    );
    assert.equal(normalizeCoachPhrase('Não'), 'nao');
    assert.ok(coachPhrasesEqual('Moro em Amadora', 'moro em amadora'));
    assert.ok(coachPhrasesEqual('Não sei', 'nao sei'));
  });

  it('matches within 2 turns then clears; expires otherwise', () => {
    let state = setCoachPhrase('Moro em Amadora');
    assert.equal(state?.turns_left, 2);

    const miss = consumeCoachPhraseOnLearnerTurn(state, 'Gosto de arroz');
    assert.equal(miss.eventLine, null);
    assert.equal(miss.next?.turns_left, 1);
    state = miss.next;

    const hit = consumeCoachPhraseOnLearnerTurn(state, 'moro em amadora');
    assert.equal(
      hit.eventLine,
      "learner practised the coach's phrase: Moro em Amadora",
    );
    assert.equal(hit.next, null);

    state = setCoachPhrase('Sim');
    const a = consumeCoachPhraseOnLearnerTurn(state, 'Olá');
    const b = consumeCoachPhraseOnLearnerTurn(a.next, 'Tudo bem');
    assert.equal(b.next, null);
    assert.equal(b.eventLine, null);
  });

  it('stores phrase from Arabic coach and sets EVENT on practise', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'cp-1',
      topicId: 'open',
      store,
      newId: () => 'cp-sess-1',
      learnerName: 'Omar',
    });
    const model = createStubConvoStreamModel({
      byCandidate: (_ids, prompt) => {
        assert.match(
          prompt,
          /learner practised the coach's phrase: Moro em Amadora/,
        );
        return [
          'PT: Fixe! E onde moras?',
          'AR: رائع! وأين تسكن؟',
          'FRAME: Moro em ___.',
          'HINT: قول المدينة',
          'CHIPS: Alfama | Amadora | Lisboa',
        ].join('\n');
      },
    });
    const coach = createStubConvoCoachCaller({
      eg: 'حلو — بالبرتغالي: «Moro em Amadora».',
    });

    const afterCoach = await runFreeConvoTurn({
      session: started.session,
      learnerText: 'ساكن في أمادورا',
      store,
      model,
      emit: () => {},
      coachCaller: coach,
    });
    assert.equal(afterCoach.session.coach_phrase?.phrase, 'Moro em Amadora');
    assert.equal(afterCoach.session.coach_phrase?.turns_left, 2);

    const afterPractise = await runFreeConvoTurn({
      session: afterCoach.session,
      learnerText: 'Moro em Amadora',
      store,
      model,
      emit: () => {},
    });
    assert.equal(afterPractise.session.coach_phrase, null);
  });
});
