import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  createMemoryProgressStore,
  handleProgressEvent,
} from '../lib/v2/progress/events';
import { MAX_ACTIVE_MINUTES_PER_EVENT } from '../lib/v2/progress/events/types';

function eid() {
  return randomUUID();
}

describe('P2 · progress events', () => {
  it('replays an event once (idempotent)', async () => {
    const store = createMemoryProgressStore();
    const event_id = eid();
    const opts = {
      userId: 'u1',
      timezone: 'Europe/Lisbon',
      now: new Date('2024-06-15T12:00:00.000Z'),
      store,
    };
    const first = await handleProgressEvent(
      {
        kind: 'step_done',
        event_id,
        target_lang: 'pt-PT',
        day: 1,
        step_id: 'story',
      },
      opts,
    );
    const second = await handleProgressEvent(
      {
        kind: 'step_done',
        event_id,
        target_lang: 'pt-PT',
        day: 1,
        step_id: 'story',
      },
      opts,
    );
    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    const lesson = await store.getLesson('u1', 'pt-PT', 1);
    assert.equal(lesson?.steps.filter((s) => s.status === 'done').length, 1);
  });

  it('completes the day when the last question is answered even if steps are open', async () => {
    const store = createMemoryProgressStore();
    const now = new Date('2024-06-15T10:00:00.000Z');
    const opts = { userId: 'u1', timezone: 'Europe/Lisbon', now, store };

    const { createEmptyLesson } = await import(
      '../lib/v2/progress/events/store'
    );
    await store.upsertLesson({
      ...createEmptyLesson({
        user_id: 'u1',
        target_lang: 'pt-PT',
        day: 3,
        status: 'available',
      }),
    });

    await handleProgressEvent(
      {
        kind: 'lesson_opened',
        event_id: eid(),
        target_lang: 'pt-PT',
        day: 3,
        steps: [
          { id: 'story', present: true },
          { id: 'grammar', present: true },
          { id: 'real_world', present: false },
          { id: 'day_questions', present: true },
        ],
        day_questions_total: 2,
      },
      opts,
    );

    const lessonAfterOpen = await store.getLesson('u1', 'pt-PT', 3);
    assert.equal(
      lessonAfterOpen?.steps.find((s) => s.id === 'real_world')?.status,
      'skipped',
    );
    assert.equal(lessonAfterOpen?.status, 'in_progress');

    await handleProgressEvent(
      {
        kind: 'day_question_answered',
        event_id: eid(),
        target_lang: 'pt-PT',
        day: 3,
        answered_count: 1,
        total: 2,
      },
      opts,
    );
    let lesson = await store.getLesson('u1', 'pt-PT', 3);
    assert.equal(lesson?.status, 'in_progress');

    const done = await handleProgressEvent(
      {
        kind: 'day_question_answered',
        event_id: eid(),
        target_lang: 'pt-PT',
        day: 3,
        answered_count: 2,
        total: 2,
        first_try_correct: true,
        skill: 'listening',
      },
      opts,
    );
    lesson = await store.getLesson('u1', 'pt-PT', 3);
    assert.equal(lesson?.status, 'completed');
    assert.ok(lesson?.steps.some((s) => s.status === 'not_started'));
    assert.equal(done.next_day?.day, 4);
    assert.equal(done.next_day?.status, 'scheduled');
    assert.equal(done.next_day?.opens_on, '2024-06-16');
  });

  it('keeps N+1 scheduled until the next local date', async () => {
    const store = createMemoryProgressStore();
    const morning = new Date('2024-06-15T08:00:00.000Z');
    await handleProgressEvent(
      {
        kind: 'day_question_answered',
        event_id: eid(),
        target_lang: 'pt-PT',
        day: 1,
        answered_count: 3,
        total: 3,
      },
      { userId: 'u1', timezone: 'Europe/Lisbon', now: morning, store },
    );
    const next = await store.getLesson('u1', 'pt-PT', 2);
    assert.equal(next?.status, 'scheduled');
    assert.equal(next?.opens_on, '2024-06-16');

    // Same local day reopen of day 2 stays scheduled.
    await handleProgressEvent(
      {
        kind: 'lesson_opened',
        event_id: eid(),
        target_lang: 'pt-PT',
        day: 2,
      },
      { userId: 'u1', timezone: 'Europe/Lisbon', now: morning, store },
    );
    assert.equal((await store.getLesson('u1', 'pt-PT', 2))?.status, 'scheduled');

    // Next local date promotes on open.
    const nextMorning = new Date('2024-06-16T08:00:00.000Z');
    await handleProgressEvent(
      {
        kind: 'lesson_opened',
        event_id: eid(),
        target_lang: 'pt-PT',
        day: 2,
      },
      { userId: 'u1', timezone: 'Europe/Lisbon', now: nextMorning, store },
    );
    assert.equal(
      (await store.getLesson('u1', 'pt-PT', 2))?.status,
      'in_progress',
    );
  });

  it('caps active minutes per event', async () => {
    const store = createMemoryProgressStore();
    await handleProgressEvent(
      {
        kind: 'active_minutes',
        event_id: eid(),
        target_lang: 'pt-PT',
        day: 1,
        minutes: 120,
      },
      {
        userId: 'u1',
        timezone: 'Europe/Lisbon',
        now: new Date('2024-06-15T12:00:00.000Z'),
        store,
      },
    );
    const lesson = await store.getLesson('u1', 'pt-PT', 1);
    assert.equal(lesson?.minutes, MAX_ACTIVE_MINUTES_PER_EVENT);
    const act = await store.getActivity('u1', '2024-06-15');
    assert.equal(act?.minutes, MAX_ACTIVE_MINUTES_PER_EVENT);
  });

  it('never blocks replays of a completed day', async () => {
    const store = createMemoryProgressStore();
    const now = new Date('2024-06-15T12:00:00.000Z');
    const opts = { userId: 'u1', timezone: 'Europe/Lisbon', now, store };
    await handleProgressEvent(
      {
        kind: 'day_question_answered',
        event_id: eid(),
        target_lang: 'pt-PT',
        day: 1,
        answered_count: 1,
        total: 1,
      },
      opts,
    );
    const completedAt = (await store.getLesson('u1', 'pt-PT', 1))?.completed_at;
    await handleProgressEvent(
      {
        kind: 'lesson_opened',
        event_id: eid(),
        target_lang: 'pt-PT',
        day: 1,
      },
      opts,
    );
    await handleProgressEvent(
      {
        kind: 'step_done',
        event_id: eid(),
        target_lang: 'pt-PT',
        day: 1,
        step_id: 'story',
      },
      opts,
    );
    const lesson = await store.getLesson('u1', 'pt-PT', 1);
    assert.equal(lesson?.status, 'completed');
    assert.deepEqual(lesson?.completed_at, completedAt);
  });
});
