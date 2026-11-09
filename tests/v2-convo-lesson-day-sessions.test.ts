import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MemoryConvoSessionStore,
  freePackId,
  listPracticeLessonDays,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';

describe('conversations v3 · lesson-day sessions are separate', () => {
  it('freePackId uses free:day-N for lesson days', () => {
    assert.equal(freePackId('open'), 'free.open');
    assert.equal(freePackId('casa'), 'free.casa');
    assert.equal(freePackId('open', 1), 'free:day-1');
    assert.equal(freePackId('open', 2), 'free:day-2');
  });

  it('day=1 after أي حاجة creates a new day-1 session', async () => {
    const store = new MemoryConvoSessionStore();
    const open = await startFreeConvoSession({
      userId: 'ld-u',
      topicId: 'open',
      store,
      newId: () => 'sess-open',
      learnerName: 'Omar',
    });
    assert.equal(open.session.pack_id, 'free.open');
    assert.equal(open.session.lesson_day, null);

    const day1 = await startFreeConvoSession({
      userId: 'ld-u',
      topicId: 'open',
      store,
      lessonDay: 1,
      newId: () => 'sess-day1',
      learnerName: 'Omar',
    });
    assert.equal(day1.resumed, false);
    assert.equal(day1.session.id, 'sess-day1');
    assert.equal(day1.session.pack_id, 'free:day-1');
    assert.equal(day1.session.lesson_day, 1);
    assert.ok(day1.session.goals.some((g) => g.id === 'day.greet'));
    assert.equal(day1.session.scene?.character_id, 'ines');
    assert.equal(day1.session.scene?.time_of_day, 'morning');
    assert.notEqual(day1.session.id, open.session.id);
  });

  it('opening day 1 twice resumes the same day-1 session', async () => {
    const store = new MemoryConvoSessionStore();
    const first = await startFreeConvoSession({
      userId: 'ld-u2',
      topicId: 'open',
      store,
      lessonDay: 1,
      newId: () => 'sess-d1-a',
      learnerName: 'Omar',
    });
    const second = await startFreeConvoSession({
      userId: 'ld-u2',
      topicId: 'open',
      store,
      lessonDay: 1,
      newId: () => 'sess-d1-b',
      learnerName: 'Omar',
    });
    assert.equal(second.resumed, true);
    assert.equal(second.session.id, first.session.id);
    assert.equal(second.session.pack_id, 'free:day-1');
  });

  it('day 2 does not resume day 1', async () => {
    const store = new MemoryConvoSessionStore();
    const day1 = await startFreeConvoSession({
      userId: 'ld-u3',
      topicId: 'open',
      store,
      lessonDay: 1,
      newId: () => 'sess-d1',
      learnerName: 'Omar',
    });
    const day2 = await startFreeConvoSession({
      userId: 'ld-u3',
      topicId: 'open',
      store,
      lessonDay: 2,
      newId: () => 'sess-d2',
      learnerName: 'Omar',
    });
    assert.equal(day2.resumed, false);
    assert.equal(day2.session.id, 'sess-d2');
    assert.equal(day2.session.pack_id, 'free:day-2');
    assert.equal(day2.session.lesson_day, 2);
    assert.notEqual(day2.session.id, day1.session.id);
  });

  it('session_id resume rejects when lesson_day mismatches', async () => {
    const store = new MemoryConvoSessionStore();
    const day1 = await startFreeConvoSession({
      userId: 'ld-u4',
      topicId: 'open',
      store,
      lessonDay: 1,
      newId: () => 'sess-mismatch',
      learnerName: 'Omar',
    });
    const again = await startFreeConvoSession({
      userId: 'ld-u4',
      topicId: 'open',
      store,
      sessionId: day1.session.id,
      lessonDay: 2,
      newId: () => 'sess-day2-new',
      learnerName: 'Omar',
    });
    assert.equal(again.resumed, false);
    assert.equal(again.session.id, 'sess-day2-new');
    assert.equal(again.session.pack_id, 'free:day-2');
  });

  it('day-1 open session does not mark أي حاجة can_resume', async () => {
    const store = new MemoryConvoSessionStore();
    await startFreeConvoSession({
      userId: 'ld-u5',
      topicId: 'open',
      store,
      lessonDay: 1,
      newId: () => 'sess-only-day1',
      learnerName: 'Omar',
    });
    const ids = await store.findOpenFreeTopicIds('ld-u5');
    assert.ok(!ids.includes('open'));
  });

  it('listPracticeLessonDays includes 1–5 in dev', async () => {
    const rows = await listPracticeLessonDays('anyone', {
      currentDay: 1,
      isDev: () => true,
    });
    assert.deepEqual(
      rows.map((r) => r.day),
      [1, 2, 3, 4, 5],
    );
    assert.ok(rows[0]?.title_tl);
    assert.ok(rows[0]?.character_id);
  });

  it('listPracticeLessonDays uses days before current when not dev', async () => {
    const rows = await listPracticeLessonDays('anyone', {
      currentDay: 4,
      isDev: () => false,
    });
    assert.deepEqual(
      rows.map((r) => r.day),
      [1, 2, 3],
    );
  });
});
