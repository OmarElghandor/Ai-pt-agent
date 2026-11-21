import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PHASE1_STORY_DAYS,
  buildPracticeWindow,
  splitDailyBudget,
} from '../lib/v2/practice';

describe('v2 practice · budget (16 §2.2)', () => {
  it('30 minutes with a lesson → review 14, cards 6', () => {
    const s = splitDailyBudget({
      daily_minutes: 30,
      has_lesson_today: true,
    });
    assert.equal(s.lesson_minutes, 10);
    assert.equal(s.review_minutes, 14);
    assert.equal(s.cards_minutes, 6);
    assert.ok(s.review_minutes > s.cards_minutes);
    assert.ok(s.review_minutes > s.lesson_minutes);
  });

  it('without a lesson → review 21, cards 9', () => {
    const s = splitDailyBudget({
      daily_minutes: 30,
      has_lesson_today: false,
    });
    assert.equal(s.lesson_minutes, 0);
    assert.equal(s.review_minutes, 21);
    assert.equal(s.cards_minutes, 9);
    assert.ok(s.review_minutes > s.cards_minutes);
  });

  it('a user value of 15 keeps review the largest share and cards at least 3', () => {
    const withLesson = splitDailyBudget({
      daily_minutes: 15,
      has_lesson_today: true,
    });
    assert.ok(withLesson.cards_minutes >= 3);
    assert.ok(withLesson.review_minutes >= withLesson.cards_minutes);
    assert.ok(withLesson.review_minutes >= withLesson.lesson_minutes);

    const noLesson = splitDailyBudget({
      daily_minutes: 15,
      has_lesson_today: false,
    });
    assert.equal(noLesson.lesson_minutes, 0);
    assert.ok(noLesson.cards_minutes >= 3);
    assert.ok(noLesson.review_minutes > noLesson.cards_minutes);
    assert.equal(
      noLesson.lesson_minutes + noLesson.review_minutes + noLesson.cards_minutes,
      15,
    );
  });
});

describe('v2 practice · window (16 §3)', () => {
  it('day 4 → [3, 2, 1]; day 5 → [4, 3, 2]', () => {
    const d4 = buildPracticeWindow({
      currentDay: 4,
      completedDays: [1, 2, 3],
    });
    assert.deepEqual(
      d4.map((w) => w.day),
      [3, 2, 1],
    );
    assert.deepEqual(
      d4.map((w) => w.position),
      [1, 2, 3],
    );

    const d5 = buildPracticeWindow({
      currentDay: 5,
      completedDays: [1, 2, 3, 4],
    });
    assert.deepEqual(
      d5.map((w) => w.day),
      [4, 3, 2],
    );
  });

  it('story days skipped', () => {
    const w = buildPracticeWindow({
      currentDay: 9,
      completedDays: [1, 2, 3, 4, 5, 6, 7, 8],
      storyDays: PHASE1_STORY_DAYS,
    });
    assert.ok(!w.some((x) => x.day === 7));
    assert.deepEqual(
      w.map((x) => x.day),
      [8, 6, 5],
    );
  });

  it('a 7-day absence gives the same window', () => {
    const completed = [1, 2, 3, 4];
    const a = buildPracticeWindow({ currentDay: 5, completedDays: completed });
    const b = buildPracticeWindow({ currentDay: 5, completedDays: completed });
    assert.deepEqual(a, b);
    // Calendar gap does not change which lessons are in the window
    assert.deepEqual(
      a.map((x) => x.day),
      [4, 3, 2],
    );
  });
});
