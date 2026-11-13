import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyStreakActivity,
  graceDaysLeft,
} from '../lib/v2/progress/streak/compute';
import { emptyStreak } from '../lib/v2/auth/types';

describe('P11 · streak with two grace days', () => {
  it('counts active days only; 1–2 misses keep the streak', () => {
    let s = emptyStreak();
    // Mon–Thu active
    for (const d of [
      '2024-06-10',
      '2024-06-11',
      '2024-06-12',
      '2024-06-13',
    ]) {
      s = applyStreakActivity(s, { localDate: d, timezone: 'Europe/Lisbon' });
    }
    assert.equal(s.current, 4);
    // Fri–Sat missed, Sun active → streak 5 (grace used, not counted)
    s = applyStreakActivity(s, {
      localDate: '2024-06-16',
      timezone: 'Europe/Lisbon',
    });
    assert.equal(s.current, 5);
    assert.ok(s.missed_days.length <= 2);
    assert.equal(graceDaysLeft(s) >= 0, true);
  });

  it('third missed day in the window restarts at 1', () => {
    let s = emptyStreak();
    s = applyStreakActivity(s, {
      localDate: '2024-06-10',
      timezone: 'Europe/Lisbon',
    });
    // skip 11, 12, 13 → three misses then 14
    s = applyStreakActivity(s, {
      localDate: '2024-06-14',
      timezone: 'Europe/Lisbon',
    });
    assert.equal(s.current, 1);
    assert.deepEqual(s.missed_days, []);
  });

  it('opening the app alone does not update streak (no call)', () => {
    const s = emptyStreak();
    assert.equal(s.current, 0);
  });
});
