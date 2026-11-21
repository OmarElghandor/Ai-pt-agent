import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  approxCardCount,
  buildDailyCards,
  buildPracticeWindow,
  cardsBudgetSeconds,
  splitDailyBudget,
  type DailyCardCandidate,
} from '../lib/v2/practice';

function cand(
  partial: Partial<DailyCardCandidate> & {
    item_id: string;
    lessonDay: number;
  },
): DailyCardCandidate {
  return {
    isWeak: false,
    isDue: true,
    isNew: false,
    outsideWindow: false,
    stage: 1,
    ...partial,
  };
}

describe('v2 practice · daily cards (16 §4)', () => {
  it('lesson day ~20 cards; no-lesson day ~30', () => {
    const withLesson = splitDailyBudget({
      daily_minutes: 30,
      has_lesson_today: true,
    });
    const noLesson = splitDailyBudget({
      daily_minutes: 30,
      has_lesson_today: false,
    });
    assert.ok(approxCardCount(withLesson.cards_minutes) >= 18);
    assert.ok(approxCardCount(withLesson.cards_minutes) <= 22);
    assert.ok(approxCardCount(noLesson.cards_minutes) >= 28);
    assert.ok(approxCardCount(noLesson.cards_minutes) <= 32);
  });

  it('at most 10 new; weak ≤25% with ≤2 outside window', () => {
    const window = buildPracticeWindow({
      currentDay: 5,
      completedDays: [1, 2, 3, 4],
    });
    const candidates: DailyCardCandidate[] = [];
    for (let i = 0; i < 40; i++) {
      candidates.push(
        cand({
          item_id: `w${i}`,
          lessonDay: 4 - (i % 3),
          isNew: i < 20,
          isDue: true,
        }),
      );
    }
    for (let i = 0; i < 15; i++) {
      candidates.push(
        cand({
          item_id: `weak${i}`,
          lessonDay: i < 5 ? 4 : 1,
          isWeak: true,
          outsideWindow: i >= 5,
          isDue: true,
        }),
      );
    }
    const budget = cardsBudgetSeconds(6);
    const built = buildDailyCards({ window, candidates, budgetSeconds: budget });
    const newCount = built.filter((b) =>
      candidates.find((c) => c.item_id === b.item_id)?.isNew,
    ).length;
    assert.ok(newCount <= 10);
    const weak = built.filter((b) => b.slot === 'weak');
    assert.ok(weak.length <= Math.floor(built.length * 0.25) + 1);
    const outsideWeak = weak.filter((b) => {
      const c = candidates.find((x) => x.item_id === b.item_id);
      return c?.outsideWindow;
    });
    assert.ok(outsideWeak.length <= 2);
  });

  it('day 5 window is days 4, 3, 2 only (+ allowed weak/maint)', () => {
    const window = buildPracticeWindow({
      currentDay: 5,
      completedDays: [1, 2, 3, 4],
    });
    assert.deepEqual(
      window.map((w) => w.day),
      [4, 3, 2],
    );
    const candidates: DailyCardCandidate[] = [];
    for (const day of [4, 3, 2, 1]) {
      for (let i = 0; i < 10; i++) {
        candidates.push(
          cand({
            item_id: `d${day}-${i}`,
            lessonDay: day,
            isDue: true,
            outsideWindow: day === 1,
            forMaint: day === 1,
            stage: day === 1 ? 3 : 1,
          }),
        );
      }
    }
    const built = buildDailyCards({
      window,
      candidates,
      budgetSeconds: cardsBudgetSeconds(6),
    });
    for (const b of built) {
      if (b.slot === 'window') {
        assert.ok([4, 3, 2].includes(b.lessonDay));
      }
    }
    assert.ok(built.length >= 15);
  });

  it('same inputs → same cards (deterministic)', () => {
    const window = buildPracticeWindow({
      currentDay: 4,
      completedDays: [1, 2, 3],
    });
    const candidates = [1, 2, 3].flatMap((day) =>
      Array.from({ length: 12 }, (_, i) =>
        cand({ item_id: `x${day}-${i}`, lessonDay: day, isDue: true }),
      ),
    );
    const a = buildDailyCards({
      window,
      candidates,
      budgetSeconds: cardsBudgetSeconds(6),
    });
    const b = buildDailyCards({
      window,
      candidates,
      budgetSeconds: cardsBudgetSeconds(6),
    });
    assert.deepEqual(a, b);
  });
});
