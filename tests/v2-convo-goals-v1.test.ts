import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  loadGoalsForDay,
  loadGoalsForTopic,
  validateGoals,
} from '@/lib/v2/convo/goals';

describe('conversations v3 V1 goals', () => {
  it('casa has 5–10 goals with examples, keywords, help', () => {
    const bank = loadGoalsForTopic('casa');
    assert.ok(bank.goals.length >= 5);
    assert.ok(bank.goals.length <= 10);
    const { ok, issues } = validateGoals(bank.goals);
    assert.equal(ok, true, JSON.stringify(issues));
    for (const g of bank.goals) {
      assert.ok(g.examples_tl.length > 0);
      assert.ok(g.keywords.length > 0);
      assert.ok(g.help.chips.length > 0);
      assert.ok(g.help.frame_tl.trim());
      assert.ok(g.help.eg.trim());
    }
  });

  it('day 1 has greet, name, ask name, Muito prazer, goodbye', () => {
    const bank = loadGoalsForDay(1, { timeOfDay: 'morning' });
    const ids = bank.goals.map((g) => g.id);
    assert.ok(ids.includes('day.greet'));
    assert.ok(ids.includes('day.name'));
    assert.ok(ids.includes('day.ask_name'));
    assert.ok(ids.includes('day.nice_to_meet'));
    assert.ok(ids.includes('day.goodbye'));

    const greet = bank.goals.find((g) => g.id === 'day.greet')!;
    assert.ok(greet.examples_tl.some((e) => /bom\s*dia/i.test(e)));

    const { ok, issues } = validateGoals(bank.goals);
    assert.equal(ok, true, JSON.stringify(issues));
    assert.equal(bank.scene?.character_id, 'ines');
    assert.equal(bank.scene?.time_of_day, 'morning');
  });

  it('every topic thread bank validates', () => {
    const topics = [
      'casa',
      'comida',
      'familia',
      'trabalho',
      'compras',
      'bairro',
      'ontem',
      'amanha',
      'transportes',
      'ginasio',
      'egito',
      'fim_de_semana',
    ];
    for (const id of topics) {
      const bank = loadGoalsForTopic(id);
      const { ok, issues } = validateGoals(bank.goals);
      assert.equal(ok, true, `${id}: ${JSON.stringify(issues)}`);
      assert.ok(bank.goals.length >= 4, id);
    }
  });
});
