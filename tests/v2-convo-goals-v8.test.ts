import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collapseRepeatedPt } from '@/lib/v2/convo/output/parseGoal';
import {
  buildTopicsList,
  isGreetingStyleDay,
  isRolePlayDay,
  ROLE_PLAY_DAYS,
} from '@/lib/v2/convo/topics';
import { loadTopicsFile } from '@/lib/v2/convo/topics/load';
import {
  checkGoals,
  isStuckHelpRequest,
  loadGoalsForDay,
  messageCompletesGoal,
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

describe('conversations v3 V8 modes + regressions', () => {
  it('role-play allowlist is day 33 only', () => {
    assert.deepEqual([...ROLE_PLAY_DAYS], [33]);
    assert.ok(isRolePlayDay(33));
    assert.ok(!isRolePlayDay(1));
    assert.ok(isGreetingStyleDay(1));
  });

  it('topics list only includes day 33', () => {
    const file = loadTopicsFile();
    const list = buildTopicsList({
      file,
      currentDay: 49,
      statesById: new Map(),
      weakIds: new Set(),
    });
    const days = list.themes.flatMap((th) => th.topics.map((t) => t.day));
    assert.ok(days.length >= 1);
    assert.ok(days.every((d) => d === 33));
  });

  it('regression: collapse repeated reaction text', () => {
    assert.equal(
      collapseRepeatedPt('Hmm… Como? Hmm… Como? Hmm… Como?'),
      'Hmm… Como?',
    );
  });

  it('regression: natural greeting accepted (not unclear)', () => {
    const bank = loadGoalsForDay(1);
    const greet = bank.goals.find((g) => g.id === 'day.greet')!;
    assert.ok(
      messageCompletesGoal('Ola bom dia, sim e meu primeiro dia', greet),
    );
  });

  it('regression: مش عارف → help frame, not bare answer', async () => {
    assert.ok(isStuckHelpRequest('مش عارف'));
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'v8-u',
      topicId: 'open',
      store,
      lessonDay: 1,
      newId: () => 'v8-sess',
    });
    started.session.goals = started.session.goals.map((g) =>
      g.id === 'day.greet' ? { ...g, status: 'done' } : g,
    );
    started.session.current_goal = 'day.name';
    await store.save(started.session);
    const events: ConvoTurnStreamEvent[] = [];
    await runFreeConvoTurn({
      session: started.session,
      learnerText: 'مش عارف',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () => 'x\nAR: y\nGOALS: -',
      }),
      emit: (e) => events.push(e),
    });
    const coach = events.find((e) => e.type === 'coach');
    assert.ok(coach && coach.type === 'coach');
    assert.ok(!/Chamo-me Omar\.?$/.test(coach.eg.trim()));
    assert.ok(events.some((e) => e.type === 'free_frame'));
  });

  it('regression: duplicate coach note not emitted twice in a row', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'v8-dup',
      topicId: 'open',
      store,
      lessonDay: 1,
      newId: () => 'v8-dup-sess',
    });
    started.session.goals = started.session.goals.map((g) =>
      g.id === 'day.greet' ? { ...g, status: 'done' } : g,
    );
    started.session.current_goal = 'day.name';
    await store.save(started.session);

    const model = createStubConvoStreamModel({
      byCandidate: () => 'x\nAR: y\nGOALS: -',
    });
    const events1: ConvoTurnStreamEvent[] = [];
    const out1 = await runFreeConvoTurn({
      session: started.session,
      learnerText: 'مش عارف',
      store,
      model,
      emit: (e) => events1.push(e),
    });
    const events2: ConvoTurnStreamEvent[] = [];
    await runFreeConvoTurn({
      session: out1.session,
      learnerText: 'مش عارف',
      store,
      model,
      emit: (e) => events2.push(e),
    });
    const coaches1 = events1.filter((e) => e.type === 'coach');
    const coaches2 = events2.filter((e) => e.type === 'coach');
    assert.equal(coaches1.length, 1);
    assert.equal(coaches2.length, 0);
  });
});
