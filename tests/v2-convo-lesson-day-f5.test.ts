import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ensureLessonDayGoalBank,
  getCachedLessonDayBankSync,
  loadGoalsForDay,
  resetMemoryLessonDayBanks,
  stubGenerateLessonDayBank,
  validateLessonDayBank,
} from '@/lib/v2/convo/goals';

describe('conversations v3 fix F5 generated lesson-day banks', () => {
  it('day 1 still prefers authored file over cache', async () => {
    resetMemoryLessonDayBanks();
    const stub = stubGenerateLessonDayBank(2);
    // Poison cache for day 1 should not matter — authored wins.
    const { bank, source } = await ensureLessonDayGoalBank({ day: 1 });
    assert.equal(source, 'authored');
    assert.match(bank.opening?.tl ?? '', /É o novo colega/);
    assert.ok(stub);
  });

  it('day 2 without file → generate → cache hit', async () => {
    resetMemoryLessonDayBanks();
    const first = await ensureLessonDayGoalBank({
      day: 2,
      generator: async ({ day }) => stubGenerateLessonDayBank(day),
    });
    assert.equal(first.fromCache, false);
    assert.equal(first.source, 'generated');
    const { ok, issues } = validateLessonDayBank(first.bank);
    assert.equal(ok, true, JSON.stringify(issues));
    assert.ok(first.bank.opening?.tl);
    assert.ok(first.bank.goals.every((g) => g.ask_tl && g.ask_ar));

    const second = await ensureLessonDayGoalBank({
      day: 2,
      generator: async () => {
        throw new Error('should not generate again');
      },
    });
    assert.equal(second.fromCache, true);
    assert.equal(second.source, 'cache');
    assert.equal(
      getCachedLessonDayBankSync(2)?.goals.length,
      first.bank.goals.length,
    );

    const viaLoader = loadGoalsForDay(2);
    assert.ok(viaLoader.opening?.tl);
    assert.equal(viaLoader.source, 'generated');
  });

  it('stub bank validates for days 2–5', () => {
    for (const day of [2, 3, 4, 5]) {
      const bank = stubGenerateLessonDayBank(day);
      const { ok, issues } = validateLessonDayBank(bank);
      assert.equal(ok, true, `day ${day}: ${JSON.stringify(issues)}`);
      assert.ok(bank.goals.length >= 4);
    }
  });
});
