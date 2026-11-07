import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyCompletedGoals,
  loadGoalsForDay,
} from '@/lib/v2/convo/goals';
import {
  formatCurrentGoalLine,
  pickGoalAskLines,
} from '@/lib/v2/convo/prompt';
import {
  MemoryConvoSessionStore,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';
import {
  createStubConvoStreamModel,
  runFreeConvoTurn,
  type ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn';
import { GOALS_DONE_COACH_EG } from '@/lib/v2/convo/goals';

describe('conversations v3 fix F4 ask lines, time, closing', () => {
  it('CURRENT GOAL includes ask_tl', () => {
    const bank = loadGoalsForDay(1);
    const name = bank.goals.find((g) => g.id === 'day.name')!;
    const ask = pickGoalAskLines(name)!;
    const line = formatCurrentGoalLine({
      intentEn: name.intent_en ?? 'say name',
      seedTl: name.seed_tl,
      askTl: ask.tl,
      goalId: name.id,
      turnsOnGoal: 0,
      openGoalIds: [name.id],
    });
    assert.match(line, /open this goal with something like:/);
    assert.match(line, /Como se chama/);
  });

  it('advancing to day.bye sets afternoon', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'f4-tod',
      topicId: 'open',
      store,
      lessonDay: 1,
      newId: () => 'f4-tod-sess',
      learnerName: 'Omar',
    });
    const bank = loadGoalsForDay(1);
    started.session.goals = started.session.goals.map((g) =>
      g.id === 'day.bye' ? g : { ...g, status: 'done' },
    );
    started.session.current_goal = 'day.nice';
    applyCompletedGoals(started.session, bank, ['day.nice']);
    assert.equal(started.session.current_goal, 'day.bye');
    assert.equal(started.session.scene?.time_of_day, 'afternoon');
  });

  it('all goals done emits closing then goals-done coach', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'f4-close',
      topicId: 'open',
      store,
      lessonDay: 1,
      newId: () => 'f4-close-sess',
      learnerName: 'Omar',
    });
    started.session.goals = started.session.goals.map((g) =>
      g.id === 'day.bye' ? g : { ...g, status: 'done' },
    );
    started.session.current_goal = 'day.bye';
    started.session.suggested_words = ['Tudo bem.', 'Obrigado.', 'Por favor.'];
    await store.save(started.session);

    const events: ConvoTurnStreamEvent[] = [];
    await runFreeConvoTurn({
      session: started.session,
      learnerText: 'Boa tarde!',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () => 'Ok!\nAR: حسناً\nGOALS: day.bye',
      }),
      emit: (e) => events.push(e),
    });

    const resets = events.filter((e) => e.type === 'reaction_reset');
    assert.ok(
      resets.some(
        (e) =>
          e.type === 'reaction_reset' && /Até amanhã/.test(e.text),
      ),
      JSON.stringify(resets),
    );
    const coach = events.find(
      (e) => e.type === 'coach' && e.id === 'goals_done',
    );
    assert.ok(coach && coach.type === 'coach');
    assert.equal(coach.eg, GOALS_DONE_COACH_EG);
  });

  it('two failed model checks fall back to ask_tl', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'f4-fb',
      topicId: 'open',
      store,
      lessonDay: 1,
      newId: () => 'f4-fb-sess',
      learnerName: 'Omar',
    });
    started.session.goals = started.session.goals.map((g) =>
      g.id === 'day.greet' ? { ...g, status: 'done' } : g,
    );
    started.session.current_goal = 'day.name';
    await store.save(started.session);

    const events: ConvoTurnStreamEvent[] = [];
    await runFreeConvoTurn({
      session: started.session,
      learnerText: 'xyz',
      store,
      model: createStubConvoStreamModel({
        // Missing AR → regenerate twice → ask fallback
        byCandidate: () => 'Bad line without markers',
      }),
      emit: (e) => events.push(e),
    });
    const ptEvents = events.filter(
      (e) =>
        (e.type === 'reaction_reset' && e.text) ||
        (e.type === 'question' && e.tl),
    );
    const joined = ptEvents
      .map((e) =>
        e.type === 'reaction_reset'
          ? e.text
          : e.type === 'question'
            ? e.tl
            : '',
      )
      .join(' | ');
    assert.match(joined, /Como se chama/);
  });
});
