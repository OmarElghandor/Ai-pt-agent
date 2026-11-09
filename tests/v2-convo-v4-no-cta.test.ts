import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OPEN_TOPIC_ID } from '@/lib/v2/convo/topics/openTopic';
import {
  MemoryConvoSessionStore,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';
import {
  createStubConvoStreamModel,
  runFreeConvoTurn,
  type ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn';

function hasCta(events: ConvoTurnStreamEvent[]): boolean {
  return events.some((e) => String(e.type).startsWith('cta'));
}

describe('conversations v4 · no Learn CTA', () => {
  it('fresh level-1 session: عايز اتعلم عن الاتجاهات locks direcoes and starts teach', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'no-cta-fresh',
      topicId: OPEN_TOPIC_ID,
      store,
      learnerLevel: 1,
      newId: () => 'no-cta-fresh-sess',
      learnerName: null,
    });
    assert.match(
      started.opening.character.tl,
      /^Olá! 😊 Sobre o que queres falar hoje\?/,
    );
    assert.doesNotMatch(started.opening.character.tl, /Olá,/);

    const events: ConvoTurnStreamEvent[] = [];
    const out = await runFreeConvoTurn({
      session: started.session,
      learnerText: 'عايز اتعلم عن الاتجاهات',
      store,
      model: createStubConvoStreamModel({ byCandidate: () => 'Ok!' }),
      emit: (e) => events.push(e),
    });

    assert.equal(out.session.topic_id, 'direcoes');
    assert.equal(out.session.topic_locked, true);
    assert.equal(out.session.teaching_mode, true);

    const lock = events.find((e) => e.type === 'topic_lock');
    assert.ok(lock && lock.type === 'topic_lock');
    assert.equal(lock.topic_id, 'direcoes');
    assert.match(lock.title_ar, /الاتجاهات/);

    assert.ok(
      events.some((e) => e.type === 'coach' && e.id.startsWith('teach:')) ||
        events.some((e) => e.type === 'question'),
      'start sequence (teach or ask) should play',
    );
    assert.ok(!hasCta(events));
  });

  it('mid-session topic request switches topic with no CTA', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'no-cta-switch',
      topicId: OPEN_TOPIC_ID,
      store,
      learnerLevel: 20,
      newId: () => 'no-cta-switch-sess',
    });

    const firstEvents: ConvoTurnStreamEvent[] = [];
    const afterCasa = await runFreeConvoTurn({
      session: started.session,
      learnerText: 'quero falar de casa',
      store,
      model: createStubConvoStreamModel({ byCandidate: () => 'Ok!' }),
      emit: (e) => firstEvents.push(e),
    });
    assert.equal(afterCasa.session.topic_id, 'casa');
    assert.equal(afterCasa.session.topic_locked, true);
    assert.ok(!hasCta(firstEvents));

    const switchEvents: ConvoTurnStreamEvent[] = [];
    const afterDir = await runFreeConvoTurn({
      session: afterCasa.session,
      learnerText: 'عايز اتعلم عن الاتجاهات',
      store,
      model: createStubConvoStreamModel({ byCandidate: () => 'Ok!' }),
      emit: (e) => switchEvents.push(e),
    });

    assert.equal(afterDir.session.topic_id, 'direcoes');
    assert.equal(afterDir.session.topic_locked, true);
    const lock = switchEvents.find((e) => e.type === 'topic_lock');
    assert.ok(lock && lock.type === 'topic_lock');
    assert.equal(lock.topic_id, 'direcoes');
    assert.match(lock.title_ar, /الاتجاهات/);
    assert.ok(!hasCta(switchEvents));
  });
});
