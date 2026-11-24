import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  createMemoryProgressStore,
  handleProgressEvent,
} from '../lib/v2/progress/events';
import { createEmptyLesson } from '../lib/v2/progress/events/store';
import { currentDayFromCompleted } from '../lib/v2/progress/learnerDay';
import { buildDayStepsFromPack } from '../lib/v2/progress/daySteps';
import type { LessonPack } from '../lib/v2/content/lesson';

function eid() {
  return randomUUID();
}

describe('v2 lesson completion tracking (11 §3.2)', () => {
  it('completes on last day_question_answered and schedules next day', async () => {
    const store = createMemoryProgressStore();
    const now = new Date('2024-06-15T10:00:00.000Z');
    const opts = { userId: 'u1', timezone: 'Europe/Lisbon', now, store };

    await store.upsertLesson({
      ...createEmptyLesson({
        user_id: 'u1',
        target_lang: 'pt-PT',
        day: 1,
        status: 'available',
      }),
    });

    await handleProgressEvent(
      {
        kind: 'lesson_opened',
        event_id: eid(),
        target_lang: 'pt-PT',
        day: 1,
        day_questions_total: 2,
      },
      opts,
    );

    await handleProgressEvent(
      {
        kind: 'day_question_answered',
        event_id: eid(),
        target_lang: 'pt-PT',
        day: 1,
        answered_count: 1,
        total: 2,
      },
      opts,
    );
    assert.equal((await store.getLesson('u1', 'pt-PT', 1))?.status, 'in_progress');

    const done = await handleProgressEvent(
      {
        kind: 'day_question_answered',
        event_id: eid(),
        target_lang: 'pt-PT',
        day: 1,
        answered_count: 2,
        total: 2,
      },
      opts,
    );
    const lesson = await store.getLesson('u1', 'pt-PT', 1);
    assert.equal(lesson?.status, 'completed');
    assert.equal(done.next_day?.day, 2);
    assert.equal(done.next_day?.status, 'scheduled');
    assert.equal(currentDayFromCompleted([1]), 2);
  });

  it('lesson_finished safety-completes when counts already satisfied', async () => {
    const store = createMemoryProgressStore();
    const now = new Date('2024-06-15T10:00:00.000Z');
    const opts = { userId: 'u1', timezone: 'Europe/Lisbon', now, store };

    // Simulate last day_question_answered lost: answered/total already set, status not completed.
    await store.upsertLesson({
      ...createEmptyLesson({
        user_id: 'u1',
        target_lang: 'pt-PT',
        day: 2,
        status: 'in_progress',
      }),
      day_questions: {
        total: 3,
        answered: 3,
        first_try_correct: 1,
        per_skill: {},
      },
    });

    const result = await handleProgressEvent(
      {
        kind: 'lesson_finished',
        event_id: eid(),
        target_lang: 'pt-PT',
        day: 2,
      },
      opts,
    );

    const lesson = await store.getLesson('u1', 'pt-PT', 2);
    assert.equal(lesson?.status, 'completed');
    assert.ok(lesson?.completed_at);
    assert.equal(result.next_day?.day, 3);
    assert.equal(result.next_day?.status, 'scheduled');
  });

  it('lesson_finished does not fake-complete when total is 0', async () => {
    const store = createMemoryProgressStore();
    const now = new Date('2024-06-15T10:00:00.000Z');
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

    await handleProgressEvent(
      {
        kind: 'lesson_finished',
        event_id: eid(),
        target_lang: 'pt-PT',
        day: 1,
      },
      { userId: 'u1', timezone: 'Europe/Lisbon', now, store },
    );

    assert.equal(
      (await store.getLesson('u1', 'pt-PT', 1))?.status,
      'in_progress',
    );
  });

  it('step_done alone never completes the day', async () => {
    const store = createMemoryProgressStore();
    const now = new Date('2024-06-15T10:00:00.000Z');
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
        first_try_correct: 0,
        per_skill: {},
      },
    });

    await handleProgressEvent(
      {
        kind: 'step_done',
        event_id: eid(),
        target_lang: 'pt-PT',
        day: 1,
        step_id: 'day_questions',
      },
      { userId: 'u1', timezone: 'Europe/Lisbon', now, store },
    );

    // Counts satisfied but step_done must not complete — only lesson_finished / answers.
    assert.equal(
      (await store.getLesson('u1', 'pt-PT', 1))?.status,
      'in_progress',
    );
  });

  it('target_lang isolation: other lang completions do not affect current day', () => {
    // Pure contract: completed days are lang-scoped before currentDayFromCompleted.
    const ptCompleted = [1, 2, 3];
    const esCompleted = [1, 2, 3, 4, 5];
    assert.equal(currentDayFromCompleted(ptCompleted), 4);
    assert.equal(currentDayFromCompleted(esCompleted), 6);
    // Mixing langs would wrongly jump — learnerCurrentDay must filter first.
    assert.notEqual(
      currentDayFromCompleted([...ptCompleted, ...esCompleted]),
      currentDayFromCompleted(ptCompleted),
    );
  });

  it('learnerCurrentDay and review/cards filter target_lang', () => {
    const daySrc = readFileSync('lib/v2/progress/learnerDay.ts', 'utf8');
    assert.match(daySrc, /target_lang: targetLang/);

    const reviewSrc = readFileSync('lib/v2/practice/reviewStore.ts', 'utf8');
    assert.match(reviewSrc, /target_lang,/);
    assert.match(reviewSrc, /target_lang/);

    const cardsSrc = readFileSync('lib/v2/progress/cardsStore.ts', 'utf8');
    assert.match(cardsSrc, /target_lang/);

    const qPage = readFileSync(
      'app/(v2)/(flow)/day/[day]/questions/page.tsx',
      'utf8',
    );
    assert.match(qPage, /lesson_finished/);
  });

  it('day_questions_total excludes practice-only questions', () => {
    const rt = (text: string) => [{ text, lang: 'eg' as const }];
    const pack = {
      lesson: {
        id: 'pt-PT.day-1',
        target_lang: 'pt-PT',
        day: 1,
        kind: 'lesson',
        pages: ['story'],
        situation: { tl: 'x', eg: 'y' },
      },
      pages: [
        {
          id: 'story',
          preset: 'story',
          mode: 'static',
          title: rt('قصة'),
          story_id: 's1',
          blocks: [],
        },
      ],
      items: [],
      questions: [
        {
          id: 'q1',
          type: 'say_it',
          skill: 'speaking',
          prompt: 'a',
          use: 'both',
        },
        {
          id: 'q2',
          type: 'say_it',
          skill: 'speaking',
          prompt: 'b',
          use: 'lesson',
        },
        {
          id: 'q3',
          type: 'say_it',
          skill: 'speaking',
          prompt: 'c',
          use: 'practice',
        },
      ],
    } as unknown as LessonPack;

    const result = buildDayStepsFromPack({ day: 1, pack });
    assert.equal(result.dayQuestionsTotal, 2);
  });
});
