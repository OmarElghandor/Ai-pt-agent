import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkGoals,
  loadGoalsForDay,
  messageCompletesGoal,
} from '@/lib/v2/convo/goals';

describe('conversations v3 V3 goal check', () => {
  it('«Ola bom dia, sim e meu primeiro dia» completes greet', () => {
    const bank = loadGoalsForDay(1, { timeOfDay: 'morning' });
    const greet = bank.goals.find((g) => g.id === 'day.greet')!;
    assert.ok(
      messageCompletesGoal(
        'Ola bom dia, sim e meu primeiro dia',
        greet,
      ),
    );
    const { completedIds } = checkGoals(
      'Ola bom dia, sim e meu primeiro dia',
      bank.goals.filter((g) => g.id === 'day.greet' || g.id === 'day.name'),
    );
    assert.ok(completedIds.includes('day.greet'));
    assert.ok(!completedIds.includes('day.name'));
  });

  it('«Chamo-me Omar. Como se chama?» completes name and ask name', () => {
    const bank = loadGoalsForDay(1);
    const open = bank.goals.filter(
      (g) =>
        g.id === 'day.name' ||
        g.id === 'day.ask_name' ||
        g.id === 'day.greet',
    );
    const { completedIds } = checkGoals(
      'Chamo-me Omar. Como se chama?',
      open,
    );
    assert.ok(completedIds.includes('day.name'));
    assert.ok(completedIds.includes('day.ask_name'));
  });
});
