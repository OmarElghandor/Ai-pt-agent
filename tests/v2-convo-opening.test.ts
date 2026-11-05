import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  composeOpeningBubbleTl,
  fillNameSlot,
} from '@/lib/v2/convo/free';
import {
  MemoryConvoSessionStore,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';

describe('v2 free chat · C3 opening', () => {
  it('fills {name} or strips the slot', () => {
    assert.equal(
      fillNameSlot('Olá {name}! 😊 Hoje vamos falar da casa?', 'Omar'),
      'Olá Omar! 😊 Hoje vamos falar da casa?',
    );
    assert.equal(
      fillNameSlot('Olá {name}! 😊 Hoje vamos falar da casa?', null),
      'Olá! 😊 Hoje vamos falar da casa?',
    );
  });

  it('start returns coach intro + one opening bubble with name', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'open-u',
      topicId: 'casa',
      store,
      newId: () => 'open-sess',
      learnerName: 'Omar',
    });
    assert.equal(started.resumed, false);
    assert.equal(started.opening.coach_intros.length, 1);
    assert.match(started.opening.coach_intros[0]!.coach_intro_eg, /البيت/);
    assert.match(started.opening.character.tl, /Omar/);
    assert.match(started.opening.character.tl, /Alfama/);
    assert.match(started.opening.character.tl, /onde moras/);
    assert.ok(started.opening.character.ar);
    // One bubble only — share+ask are inside character.tl
    assert.equal(started.session.pending_question?.id, 'casa.t1.ask');
  });

  it('composeOpeningBubbleTl joins opening + share + ask', () => {
    const tl = composeOpeningBubbleTl({
      opening_tl: 'Olá {name}!',
      share_tl: 'Eu moro em Alfama.',
      ask_tl: 'E tu, onde moras?',
      name: 'Sara',
    });
    assert.equal(tl, 'Olá Sara! Eu moro em Alfama. E tu, onde moras?');
  });

  it('open mode opening fills learner name (E6)', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'open-name',
      topicId: 'open',
      store,
      newId: () => 'open-name-1',
      learnerName: 'Omar',
    });
    assert.match(started.opening.character.tl, /Omar/);
    assert.doesNotMatch(started.opening.character.tl, /\{name\}/);
  });
});
