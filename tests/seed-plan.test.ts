import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadSeedPlan } from '../lib/lessons/seedPlan';
import { getLearnerLessonPlan, mergeSeedWithMongo } from '../lib/lessons/plan';

describe('loadSeedPlan', () => {
  it('returns 129 ordered slots starting with pl-001', () => {
    const slots = loadSeedPlan();
    assert.equal(slots.length, 129);
    assert.equal(slots[0].lessonKey, 'pl-001');
    assert.equal(slots[1].lessonKey, 'pl-002');
    assert.deepEqual(slots[1].cellIds, []);
    assert.equal(slots[1].requirements.words.length, 0);
    for (let i = 1; i < slots.length; i++) {
      assert.ok(slots[i].order >= slots[i - 1].order);
    }
  });
});

describe('mergeSeedWithMongo', () => {
  it('returns 129 lessons when Mongo list is empty', () => {
    const seed = loadSeedPlan();
    const lessons = mergeSeedWithMongo(seed, [], null);
    assert.equal(lessons.length, 129);
    assert.equal(lessons[0].lessonKey, 'pl-001');
    assert.equal(lessons[0].hasPack, false);
    const coffee = lessons.find((l) => l.lessonKey === 'pl-002');
    assert.ok(coffee);
    assert.equal(coffee!.uiStatus, 'available');
  });

  it('overlays hasPack from a Mongo live doc', () => {
    const seed = loadSeedPlan();
    const lessons = mergeSeedWithMongo(
      seed,
      [
        {
          lessonKey: 'pl-002',
          topic: 'pl-002',
          depthTier: 3,
          cefrLevel: 'A0',
          curriculumPoint: 2,
          cellIds: [],
          titleAr: 'من Mongo',
          situationAr: 'من المواصفات',
          situationEn: null,
          status: 'live',
          version: 1,
          requirements: { cells: [], words: ['e'] },
          hasSpec: true,
          hasPack: true,
          generationStage: null,
          needsOmarReview: false,
          audioCacheRefs: [],
        },
      ],
      {
        cells: [],
        words: ['e'],
        finishedMissions: [],
      },
    );
    const coffee = lessons.find((l) => l.lessonKey === 'pl-002');
    assert.ok(coffee);
    assert.equal(coffee!.hasPack, true);
    assert.equal(coffee!.titleAr, 'من Mongo');
    assert.equal(coffee!.status, 'live');
    assert.equal(lessons.length, 129);
  });
});

describe('getLearnerLessonPlan', () => {
  it('returns seed list even when Mongo URI is unset', async () => {
    const prev = process.env.MONGODB_URI;
    delete process.env.MONGODB_URI;
    try {
      const plan = await getLearnerLessonPlan('test-learner');
      assert.equal(plan.lessons.length, 129);
      assert.equal(plan.source, 'seed');
    } finally {
      if (prev !== undefined) process.env.MONGODB_URI = prev;
    }
  });
});
