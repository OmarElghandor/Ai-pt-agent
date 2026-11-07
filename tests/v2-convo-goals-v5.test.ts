import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isStuckHelpRequest,
  loadGoalsForDay,
  steerActionForTurns,
  stuckHelpForGoal,
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

describe('conversations v3 V5 steering', () => {
  it('escalation actions for turns 2, 3, 4', () => {
    const bank = loadGoalsForDay(1);
    const goal = bank.goals.find((g) => g.id === 'day.name')!;
    assert.equal(steerActionForTurns(1, goal).kind, 'none');
    assert.equal(steerActionForTurns(2, goal).kind, 'ask_directly');
    assert.equal(steerActionForTurns(3, goal).kind, 'coach_frame');
    const give = steerActionForTurns(4, goal);
    assert.equal(give.kind, 'coach_give_answer');
    if (give.kind === 'coach_give_answer') {
      assert.match(give.sentence_tl, /Chamo-me/i);
    }
  });

  it('مش عارف returns frame help, not the bare final answer alone', async () => {
    assert.ok(isStuckHelpRequest('مش عارف'));
    const bank = loadGoalsForDay(1);
    const name = bank.goals.find((g) => g.id === 'day.name')!;
    const help = stuckHelpForGoal(name);
    assert.match(help.frame_tl, /Chamo-me/i);
    assert.ok(help.chips.length > 0);

    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'v5-u',
      topicId: 'open',
      store,
      lessonDay: 1,
      newId: () => 'v5-sess',
      learnerName: 'Omar',
    });
    // Move current goal to name.
    started.session.goals = started.session.goals.map((g) =>
      g.id === 'day.greet' ? { ...g, status: 'done' } : g,
    );
    started.session.current_goal = 'day.name';
    await store.save(started.session);

    const events: ConvoTurnStreamEvent[] = [];
    const model = createStubConvoStreamModel({
      byCandidate: () => 'Chamo-me Inês.\nAR: اسمي إينيس\nGOALS: -',
    });
    await runFreeConvoTurn({
      session: started.session,
      learnerText: 'مش عارف',
      store,
      model,
      emit: (e) => events.push(e),
    });
    const coach = events.find((e) => e.type === 'coach');
    assert.ok(coach && coach.type === 'coach');
    assert.match(coach.eg, /Chamo-me|اسمك/i);
    // Must not be only a full answer without frame context.
    assert.ok(events.some((e) => e.type === 'free_frame'));
    // Character does not speak on stuck help (code help only).
    assert.ok(!events.some((e) => e.type === 'question'));
  });

  it('never emits مش واضح for typed Portuguese on a goal turn', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'v5-clear',
      topicId: 'casa',
      store,
      newId: () => 'v5-clear-sess',
    });
    const events: ConvoTurnStreamEvent[] = [];
    const model = createStubConvoStreamModel({
      byCandidate: () =>
        'Desculpa, não percebi… moras onde?\nAR: آسف\nGOALS: -',
    });
    await runFreeConvoTurn({
      session: started.session,
      learnerText: 'blabla xyz',
      store,
      model,
      emit: (e) => events.push(e),
    });
    const coachTexts = events
      .filter((e) => e.type === 'coach')
      .map((e) => (e.type === 'coach' ? e.eg : ''));
    assert.ok(!coachTexts.some((eg) => /مش واضح/.test(eg)));
  });
});
