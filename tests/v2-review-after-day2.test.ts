import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  buildPracticeWindow,
  classifyReviewEmpty,
  firstMissingCompletedDay,
  reviewEmptyCopyEg,
} from '../lib/v2/practice';
import {
  createMemoryProgressStore,
  handleProgressEvent,
} from '../lib/v2/progress/events';
import { createEmptyLesson } from '../lib/v2/progress/events/store';
import { currentDayFromCompleted } from '../lib/v2/progress/learnerDay';

function eid() {
  return randomUUID();
}

describe('v2 review after day 2 (empty window / gaps)', () => {
  it('[2] only → currentDay 1 → empty window + gap reason', () => {
    const completed = [2];
    const currentDay = currentDayFromCompleted(completed);
    assert.equal(currentDay, 1);
    const window = buildPracticeWindow({
      currentDay,
      completedDays: completed,
    });
    assert.deepEqual(window, []);
    const reason = classifyReviewEmpty({
      currentDay,
      completedDaysAll: completed,
      windowLength: 0,
    });
    assert.equal(reason, 'no_completed_before_current');
    const copy = reviewEmptyCopyEg(reason, {
      completedDays: completed,
      currentDay,
    });
    assert.match(copy.title, /يوم 1/);
    assert.equal(copy.ctaDay, 1);
    assert.equal(firstMissingCompletedDay(completed), 1);
  });

  it('[1,2] → currentDay 3 → window [2,1]', () => {
    const completed = [1, 2];
    const currentDay = currentDayFromCompleted(completed);
    assert.equal(currentDay, 3);
    const window = buildPracticeWindow({
      currentDay,
      completedDays: completed,
    });
    assert.deepEqual(
      window.map((w) => w.day),
      [2, 1],
    );
    assert.equal(
      classifyReviewEmpty({
        currentDay,
        completedDaysAll: completed,
        windowLength: window.length,
      }),
      null,
    );
  });

  it('window ok but steps 0 → empty_steps reason', () => {
    assert.equal(
      classifyReviewEmpty({
        currentDay: 3,
        completedDaysAll: [1, 2],
        windowLength: 2,
        stepsLength: 0,
      }),
      'empty_steps',
    );
    const copy = reviewEmptyCopyEg('empty_steps', {
      currentDay: 3,
      completedDays: [1, 2],
    });
    assert.match(copy.title, /مش جاهزة/);
  });

  it('completing day 2 repairs stuck day 1 with satisfied counts', async () => {
    const store = createMemoryProgressStore();
    const now = new Date('2024-06-15T12:00:00.000Z');
    const opts = { userId: 'u1', timezone: 'Europe/Lisbon', now, store };

    // Day 1 stuck: answered all questions but never marked completed
    await store.upsertLesson({
      ...createEmptyLesson({
        user_id: 'u1',
        target_lang: 'pt-PT',
        day: 1,
        status: 'in_progress',
      }),
      day_questions: {
        total: 2,
        answered: 2,
        first_try_correct: 1,
        per_skill: {},
      },
    });

    await store.upsertLesson({
      ...createEmptyLesson({
        user_id: 'u1',
        target_lang: 'pt-PT',
        day: 2,
        status: 'available',
      }),
      day_questions: {
        total: 1,
        answered: 0,
        first_try_correct: 0,
        per_skill: {},
      },
    });

    await handleProgressEvent(
      {
        kind: 'day_question_answered',
        event_id: eid(),
        target_lang: 'pt-PT',
        day: 2,
        answered_count: 1,
        total: 1,
      },
      opts,
    );

    const day1 = await store.getLesson('u1', 'pt-PT', 1);
    const day2 = await store.getLesson('u1', 'pt-PT', 2);
    assert.equal(day2?.status, 'completed');
    assert.equal(day1?.status, 'completed');
    assert.equal(currentDayFromCompleted([1, 2]), 3);
  });

  it('lesson_finished also repairs prior stuck days', async () => {
    const store = createMemoryProgressStore();
    const now = new Date('2024-06-15T12:00:00.000Z');

    await store.upsertLesson({
      ...createEmptyLesson({
        user_id: 'u1',
        target_lang: 'pt-PT',
        day: 1,
        status: 'in_progress',
      }),
      day_questions: {
        total: 1,
        answered: 1,
        first_try_correct: 0,
        per_skill: {},
      },
    });
    await store.upsertLesson({
      ...createEmptyLesson({
        user_id: 'u1',
        target_lang: 'pt-PT',
        day: 2,
        status: 'completed',
      }),
      day_questions: {
        total: 1,
        answered: 1,
        first_try_correct: 0,
        per_skill: {},
      },
      completed_at: now,
      times_completed: 1,
    });

    await handleProgressEvent(
      {
        kind: 'lesson_finished',
        event_id: eid(),
        target_lang: 'pt-PT',
        day: 2,
      },
      { userId: 'u1', timezone: 'Europe/Lisbon', now, store },
    );

    assert.equal((await store.getLesson('u1', 'pt-PT', 1))?.status, 'completed');
  });

  it('does not fake-complete prior days with total 0', async () => {
    const store = createMemoryProgressStore();
    const now = new Date('2024-06-15T12:00:00.000Z');

    await store.upsertLesson({
      ...createEmptyLesson({
        user_id: 'u1',
        target_lang: 'pt-PT',
        day: 1,
        status: 'in_progress',
      }),
      day_questions: {
        total: 0,
        answered: 0,
        first_try_correct: 0,
        per_skill: {},
      },
    });
    await store.upsertLesson({
      ...createEmptyLesson({
        user_id: 'u1',
        target_lang: 'pt-PT',
        day: 2,
        status: 'available',
      }),
    });

    await handleProgressEvent(
      {
        kind: 'day_question_answered',
        event_id: eid(),
        target_lang: 'pt-PT',
        day: 2,
        answered_count: 1,
        total: 1,
      },
      { userId: 'u1', timezone: 'Europe/Lisbon', now, store },
    );

    assert.equal((await store.getLesson('u1', 'pt-PT', 2))?.status, 'completed');
    assert.equal(
      (await store.getLesson('u1', 'pt-PT', 1))?.status,
      'in_progress',
    );
  });
});
