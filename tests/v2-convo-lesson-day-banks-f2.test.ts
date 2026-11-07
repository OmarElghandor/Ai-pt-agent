import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  loadAuthoredLessonDayBank,
  loadGoalsForDay,
  parseLessonDayBankJson,
  validateLessonDayBank,
} from '@/lib/v2/convo/goals';

describe('conversations v3 fix F2 authored lesson-day banks', () => {
  it('loads day-1 file with opening, asks, formal address', () => {
    const bank = loadAuthoredLessonDayBank(1);
    assert.ok(bank);
    assert.equal(bank!.day, 1);
    assert.match(bank!.opening!.tl, /É o novo colega/);
    assert.equal(bank!.scene?.address, 'formal');
    assert.deepEqual(
      bank!.goals.map((g) => g.id),
      ['day.greet', 'day.name', 'day.ask_name', 'day.nice', 'day.bye'],
    );
    assert.ok(bank!.goals.every((g) => g.ask_tl && g.ask_ar));
    assert.equal(bank!.goals.find((g) => g.id === 'day.bye')?.time_of_day, 'afternoon');
  });

  it('loadGoalsForDay(1) prefers authored file', () => {
    const bank = loadGoalsForDay(1);
    assert.match(bank.opening?.tl ?? '', /É o novo colega/);
    assert.equal(bank.title_tl, 'Apresentar-se');
  });

  it('rejects missing ask_tl and duplicate ids', () => {
    const base = loadAuthoredLessonDayBank(1)!;
    const missingAsk = {
      ...base,
      goals: base.goals.map((g, i) =>
        i === 0 ? { ...g, ask_tl: '', ask_ar: g.ask_ar } : g,
      ),
    };
    const badAsk = validateLessonDayBank(missingAsk);
    assert.equal(badAsk.ok, false);
    assert.ok(badAsk.issues.some((i) => i.rule === 'ask'));

    assert.throws(() => {
      parseLessonDayBankJson({
        ...base,
        goals: [
          base.goals[0],
          { ...base.goals[1], id: base.goals[0]!.id },
          ...base.goals.slice(2),
        ],
      });
    }, /duplicate/);
  });
});
