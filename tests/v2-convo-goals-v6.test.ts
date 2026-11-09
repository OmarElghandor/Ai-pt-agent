import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GOALS_DONE_COACH_EG,
  goalsFromWeakSurfaces,
  refillSessionGoals,
} from '@/lib/v2/convo/goals';
import {
  MemoryConvoSessionStore,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';
import {
  createStubConvoStreamModel,
  runFreeConvoTurn,
  type ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn';

describe('conversations v3 V6 goals done continue', () => {
  it('builds 3 goals from weak surfaces', () => {
    const goals = goalsFromWeakSurfaces(
      ['Tudo bem?', 'Obrigado.', 'Até logo!', 'Extra'],
      { count: 3, topicSlug: 'casa' },
    );
    assert.equal(goals.length, 3);
    assert.ok(goals.every((g) => g.id.startsWith('casa.weak.')));
  });

  it('refills session and emits goals-done coach', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'v6-u',
      topicId: 'open',
      store,
      lessonDay: 1,
      newId: () => 'v6-sess',
      learnerName: 'Omar',
    });
    // Mark all but bye done; complete bye this turn.
    started.session.goals = started.session.goals.map((g) =>
      g.id === 'day.bye' ? g : { ...g, status: 'done' },
    );
    started.session.current_goal = 'day.bye';
    started.session.suggested_words = ['Tudo bem.', 'Obrigado.', 'Por favor.'];
    await store.save(started.session);

    const events: ConvoTurnStreamEvent[] = [];
    const model = createStubConvoStreamModel({
      byCandidate: () =>
        'Até amanhã!\nAR: إلى الغد!\nGOALS: day.bye',
    });
    const { session } = await runFreeConvoTurn({
      session: started.session,
      learnerText: 'Boa tarde!',
      store,
      model,
      emit: (e) => events.push(e),
    });

    const coach = events.find(
      (e) => e.type === 'coach' && e.id === 'goals_done',
    );
    assert.ok(coach && coach.type === 'coach');
    assert.equal(coach.eg, GOALS_DONE_COACH_EG);
    assert.ok(session.goals.some((g) => g.status === 'open'));
    assert.ok(session.current_goal?.includes('weak'));
    assert.equal(session.status, 'open');
  });

  it('refillSessionGoals appends states', () => {
    const refill = refillSessionGoals({
      existingStates: [{ id: 'a', status: 'done' }],
      existingDefs: [],
      weakSurfaces: ['Olá!', 'Bom dia!', 'Tchau!'],
      topicSlug: 'x',
    });
    assert.equal(refill.newGoals.length, 3);
    assert.equal(refill.states.length, 4);
    assert.ok(refill.current_goal);
  });
});
