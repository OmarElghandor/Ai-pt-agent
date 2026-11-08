import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkGoals,
  messageCompletesGoal,
} from '@/lib/v2/convo/goals';
import { loadAuthoredTopicBank } from '@/lib/v2/convo/goals/loadTopicBank';

describe('conversations v4 · short-answer false complete', () => {
  const bank = loadAuthoredTopicBank('direcoes')!;
  const cores = bank.goals.filter((g) => g.tier === 'core');
  const station = bank.goals.find((g) => g.id === 'dir.station')!;
  const right = bank.goals.find((g) => g.id === 'dir.right')!;
  const metro = bank.goals.find((g) => g.id === 'dir.metro')!;

  it('«Sim» does not complete dir.station or multi-skip cores', () => {
    assert.equal(messageCompletesGoal('Sim', station), false);
    assert.equal(messageCompletesGoal('sim', station), false);
    assert.deepEqual(checkGoals('Sim', cores).completedIds, []);
  });

  it('«Sim, estou na estação.» does complete dir.station', () => {
    assert.ok(messageCompletesGoal('Sim, estou na estação.', station));
  });

  it('«Para à direita» / «À direita.» complete dir.right', () => {
    assert.ok(messageCompletesGoal('Para à direita', right));
    assert.ok(messageCompletesGoal('À direita.', right));
  });

  it('«De metro.» still completes dir.metro', () => {
    assert.ok(messageCompletesGoal('De metro.', metro));
    assert.ok(messageCompletesGoal('De metro', metro));
  });

  it('other short stopwords do not false-complete station', () => {
    assert.equal(messageCompletesGoal('Já', station), false);
    assert.equal(messageCompletesGoal('Estou', station), false);
  });
});
