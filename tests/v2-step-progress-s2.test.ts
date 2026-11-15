import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import type { DayStep } from '../lib/v2/progress/daySteps';
import {
  createEmptyLesson,
  createMemoryProgressStore,
  handleProgressEvent,
  lessonProgressWritable,
} from '../lib/v2/progress/events';
import { buildStepView } from '../lib/v2/progress/stepView';

function eid() {
  return randomUUID();
}

function sharedList(ids: string[], opts?: { skip?: string[] }): DayStep[] {
  const skip = new Set(opts?.skip ?? []);
  return ids.map((id) => {
    const kind =
      id === 'practice'
        ? ('practice' as const)
        : id === 'day_questions'
          ? ('questions' as const)
          : id === 'find_image'
            ? ('find_image' as const)
            : ('page' as const);
    const present = !skip.has(id);
    const counted = present && kind !== 'practice';
    return {
      id,
      kind,
      title: id === 'story' ? 'القصة' : id,
      minutes: 3,
      href:
        id === 'practice'
          ? '/practice/3'
          : id === 'day_questions'
            ? '/day/3/questions'
            : id === 'find_image'
              ? '/day/3/find-image'
              : `/day/3/page/${id}`,
      present,
      counted,
    };
  });
}

const DAY3 = sharedList([
  'story',
  'page_a',
  'page_b',
  'page_c',
  'find_image',
  'day_questions',
  'practice',
], { skip: ['find_image'] });

describe('S2 · step view', () => {
  it('no steps done → next is the story', () => {
    const view = buildStepView(
      {
        status: 'in_progress',
        steps: DAY3.map((s) => ({
          id: s.id,
          status: s.present ? 'not_started' : 'skipped',
          done_at: null,
        })),
      },
      DAY3,
    );
    assert.equal(view.nextStep?.id, 'story');
    assert.equal(view.done, 0);
    assert.equal(view.total, 5); // no find_image, no practice
    assert.equal(view.started, false);
  });

  it('story and two pages done → next is the third page', () => {
    const view = buildStepView(
      {
        status: 'in_progress',
        steps: [
          { id: 'story', status: 'done', done_at: new Date() },
          { id: 'page_a', status: 'done', done_at: new Date() },
          { id: 'page_b', status: 'done', done_at: new Date() },
          { id: 'page_c', status: 'not_started', done_at: null },
          { id: 'find_image', status: 'skipped', done_at: null },
          { id: 'day_questions', status: 'not_started', done_at: null },
          { id: 'practice', status: 'not_started', done_at: null },
        ],
      },
      DAY3,
    );
    assert.equal(view.nextStep?.id, 'page_c');
    assert.equal(view.done, 3);
    assert.equal(view.total, 5);
    assert.equal(view.lastDoneStep?.id, 'page_b');
    assert.equal(view.started, true);
  });

  it('all pages done → next is day_questions', () => {
    const view = buildStepView(
      {
        status: 'in_progress',
        steps: [
          { id: 'story', status: 'done', done_at: new Date() },
          { id: 'page_a', status: 'done', done_at: new Date() },
          { id: 'page_b', status: 'done', done_at: new Date() },
          { id: 'page_c', status: 'done', done_at: new Date() },
          { id: 'find_image', status: 'skipped', done_at: null },
          { id: 'day_questions', status: 'not_started', done_at: null },
          { id: 'practice', status: 'not_started', done_at: null },
        ],
      },
      DAY3,
    );
    assert.equal(view.nextStep?.id, 'day_questions');
    assert.equal(view.done, 4);
  });

  it('completed day → no next step', () => {
    const view = buildStepView(
      {
        status: 'completed',
        steps: [
          { id: 'story', status: 'done', done_at: new Date() },
          { id: 'page_a', status: 'done', done_at: new Date() },
          { id: 'day_questions', status: 'done', done_at: new Date() },
          { id: 'practice', status: 'not_started', done_at: null },
        ],
      },
      DAY3,
    );
    assert.equal(view.nextStep, null);
  });

  it('skipped steps are never next and never counted', () => {
    const withFind = sharedList([
      'story',
      'find_image',
      'day_questions',
      'practice',
    ]);
    const view = buildStepView(
      {
        status: 'in_progress',
        steps: [
          { id: 'story', status: 'done', done_at: new Date() },
          { id: 'find_image', status: 'skipped', done_at: null },
          { id: 'day_questions', status: 'not_started', done_at: null },
          { id: 'practice', status: 'not_started', done_at: null },
        ],
      },
      withFind,
    );
    assert.equal(view.nextStep?.id, 'day_questions');
    assert.ok(!view.nextStep || view.nextStep.id !== 'find_image');
    assert.equal(view.total, 2); // story + questions; find skipped, practice not counted
  });

  it('doc with no saved order falls back to the shared order', () => {
    const view = buildStepView(
      { status: 'available', steps: [] },
      DAY3,
    );
    assert.equal(view.nextStep?.id, 'story');
    assert.equal(view.total, 5);
  });
});

describe('S2 · lock guard', () => {
  it('step_done on a locked day 4 writes nothing', async () => {
    const store = createMemoryProgressStore();
    await store.upsertLesson(
      createEmptyLesson({
        user_id: 'u1',
        target_lang: 'pt-PT',
        day: 4,
        status: 'locked',
      }),
    );
    const before = await store.getLesson('u1', 'pt-PT', 4);
    await handleProgressEvent(
      {
        kind: 'step_done',
        event_id: eid(),
        target_lang: 'pt-PT',
        day: 4,
        step_id: 'story',
      },
      {
        userId: 'u1',
        timezone: 'Europe/Lisbon',
        now: new Date('2024-06-15T12:00:00.000Z'),
        store,
      },
    );
    const after = await store.getLesson('u1', 'pt-PT', 4);
    assert.equal(after?.status, 'locked');
    assert.deepEqual(after?.steps, before?.steps);
    assert.equal(after?.resume, null);
  });

  it('lesson_opened on locked day 4 writes nothing', async () => {
    const store = createMemoryProgressStore();
    await store.upsertLesson(
      createEmptyLesson({
        user_id: 'u1',
        target_lang: 'pt-PT',
        day: 4,
        status: 'locked',
      }),
    );
    await handleProgressEvent(
      {
        kind: 'lesson_opened',
        event_id: eid(),
        target_lang: 'pt-PT',
        day: 4,
        steps: [
          { id: 'story', present: true },
          { id: 'day_questions', present: true },
        ],
      },
      {
        userId: 'u1',
        timezone: 'Europe/Lisbon',
        now: new Date('2024-06-15T12:00:00.000Z'),
        store,
      },
    );
    const after = await store.getLesson('u1', 'pt-PT', 4);
    assert.equal(after?.status, 'locked');
    assert.equal(after?.steps.length, 0);
  });

  it('day 1 still unlocks from locked via step_done', async () => {
    const store = createMemoryProgressStore();
    await store.upsertLesson(
      createEmptyLesson({
        user_id: 'u1',
        target_lang: 'pt-PT',
        day: 1,
        status: 'locked',
      }),
    );
    await handleProgressEvent(
      {
        kind: 'step_done',
        event_id: eid(),
        target_lang: 'pt-PT',
        day: 1,
        step_id: 'story',
      },
      {
        userId: 'u1',
        timezone: 'Europe/Lisbon',
        now: new Date('2024-06-15T12:00:00.000Z'),
        store,
      },
    );
    const after = await store.getLesson('u1', 'pt-PT', 1);
    assert.equal(after?.status, 'in_progress');
    assert.equal(after?.steps[0]?.status, 'done');
  });

  it('admin+dev unlocks a locked day 4', async () => {
    const store = createMemoryProgressStore();
    await store.upsertLesson(
      createEmptyLesson({
        user_id: 'u1',
        target_lang: 'pt-PT',
        day: 4,
        status: 'locked',
      }),
    );
    await handleProgressEvent(
      {
        kind: 'step_done',
        event_id: eid(),
        target_lang: 'pt-PT',
        day: 4,
        step_id: 'story',
      },
      {
        userId: 'u1',
        timezone: 'Europe/Lisbon',
        now: new Date('2024-06-15T12:00:00.000Z'),
        store,
        allowDevUnlock: true,
      },
    );
    const after = await store.getLesson('u1', 'pt-PT', 4);
    assert.equal(after?.status, 'in_progress');
    assert.equal(after?.steps.find((s) => s.id === 'story')?.status, 'done');
  });

  it('lessonProgressWritable rejects future scheduled days', () => {
    assert.equal(
      lessonProgressWritable(
        { day: 5, status: 'scheduled', opens_on: '2099-01-01' },
        { localDate: '2024-06-15' },
      ),
      false,
    );
    assert.equal(
      lessonProgressWritable(
        { day: 5, status: 'scheduled', opens_on: '2024-06-15' },
        { localDate: '2024-06-15' },
      ),
      true,
    );
  });
});
