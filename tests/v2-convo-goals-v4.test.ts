import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseGoalConvoTurn,
  parseReportedGoalIds,
  splitGoalMarkers,
} from '@/lib/v2/convo/output/parseGoal';
import {
  formatCurrentGoalLine,
  buildGoalFreePrompt,
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

describe('conversations v3 V4 prompt + parse', () => {
  it('splits PT / AR / GOALS markers', () => {
    const split = splitGoalMarkers(
      'Ah, bom dia! Como te chamas?\nAR: آه صباح الخير!\nGOALS: day.greet',
    );
    assert.match(split.pt, /bom dia/i);
    assert.ok(split.ar?.includes('صباح'));
    assert.equal(split.goalsRaw, 'day.greet');
  });

  it('tolerates missing GOALS and unknown ids', () => {
    const missing = parseGoalConvoTurn(
      'Olá! Como estás?\nAR: مرحبا',
    );
    assert.equal(missing.goals_missing, true);
    assert.deepEqual(missing.reported_goal_ids, []);

    const unknown = parseReportedGoalIds('day.greet, not.a.real.id');
    assert.deepEqual(unknown.ids, ['day.greet', 'not.a.real.id']);
  });

  it('CURRENT GOAL is part 4', () => {
    const line = formatCurrentGoalLine({
      intentEn: 'say their name',
      seedTl: 'Chamo-me Inês.',
      goalId: 'day.name',
      turnsOnGoal: 0,
      openGoalIds: ['day.name'],
    });
    const built = buildGoalFreePrompt({
      module: 'free',
      pack: null,
      freeTopicTitle: 'Apresentar-se',
      facts: [],
      event: {
        verdict: 'correct',
        item_id: '',
        question_id: 'day.name',
        question_kind: 'open',
        phase: 'teaching',
      },
      eventLine: 'learner replied',
      candidates: [],
      lastExchanges: [],
      learnerAnswer: 'Olá',
      personaJson: '{}',
      currentGoalLine: line,
    });
    assert.equal(built.parts[3]?.label, 'CURRENT GOAL');
    assert.match(built.parts[3]!.text, /say their name/);
  });

  it('goal turn completes greet without authored_append', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'v4-u',
      topicId: 'open',
      store,
      lessonDay: 1,
      newId: () => 'v4-sess',
      learnerName: 'Omar',
    });
    const events: ConvoTurnStreamEvent[] = [];
    const model = createStubConvoStreamModel({
      byCandidate: () =>
        'Bom dia! Como te chamas?\nAR: صباح الخير!\nGOALS: day.greet',
    });
    const { session } = await runFreeConvoTurn({
      session: started.session,
      learnerText: 'Ola bom dia, sim e meu primeiro dia',
      store,
      model,
      emit: (e) => events.push(e),
    });
    assert.ok(!events.some((e) => e.type === 'authored_append'));
    const greet = session.goals.find((g) => g.id === 'day.greet');
    assert.equal(greet?.status, 'done');
    assert.equal(session.current_goal, 'day.name');
  });
});
