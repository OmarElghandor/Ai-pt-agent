import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadSeedPlan } from '../lib/lessons/seedPlan';
import { getLearnerLessonPlan, mergeSeedWithMongo } from '../lib/lessons/plan';

describe('loadSeedPlan', () => {
  it('returns 24 ordered slots starting with ps-01', () => {
    const slots = loadSeedPlan();
    assert.equal(slots.length, 24);
    assert.equal(slots[0].lessonKey, 'ps-01-neighbour-greetings');
    assert.equal(slots[3].lessonKey, 'ps-04-coffee-please');
    assert.deepEqual(slots[3].cellIds, []);
    assert.equal(slots[3].requirements.words.length, 0);
    for (let i = 1; i < slots.length; i++) {
      assert.ok(slots[i].order >= slots[i - 1].order);
    }
  });
});

describe('mergeSeedWithMongo', () => {
  it('returns 24 lessons when Mongo list is empty', () => {
    const seed = loadSeedPlan();
    const lessons = mergeSeedWithMongo(seed, [], null);
    assert.equal(lessons.length, 24);
    assert.equal(lessons[0].lessonKey, 'ps-01-neighbour-greetings');
    assert.equal(lessons[0].hasPack, false);
    const coffee = lessons.find((l) => l.lessonKey === 'ps-04-coffee-please');
    assert.ok(coffee);
    assert.equal(coffee!.uiStatus, 'available');
  });

  it('overlays hasPack from a Mongo live doc', () => {
    const seed = loadSeedPlan();
    const lessons = mergeSeedWithMongo(
      seed,
      [
        {
          lessonKey: 'ps-04-coffee-please',
          topic: 'cafe_e_comida',
          depthTier: 1,
          cefrLevel: 'A0',
          curriculumPoint: 4,
          cellIds: [],
          titleAr: 'قهوة من Mongo',
          situationAr: 'من المواصفات',
          situationEn: null,
          status: 'live',
          version: 1,
          requirements: { cells: [], words: ['queria um café'] },
          hasSpec: true,
          hasPack: true,
          generationStage: null,
          needsOmarReview: false,
          audioCacheRefs: [],
        },
      ],
      {
        cells: [],
        words: ['queria um café'],
        finishedMissions: [],
      },
    );
    const coffee = lessons.find((l) => l.lessonKey === 'ps-04-coffee-please');
    assert.ok(coffee);
    assert.equal(coffee!.hasPack, true);
    assert.equal(coffee!.titleAr, 'قهوة من Mongo');
    assert.equal(coffee!.status, 'live');
    assert.equal(lessons.length, 24);
  });
});

describe('getLearnerLessonPlan', () => {
  it('returns seed list even when Mongo URI is unset', async () => {
    const prev = process.env.MONGODB_URI;
    delete process.env.MONGODB_URI;
    try {
      const plan = await getLearnerLessonPlan('test-learner');
      assert.equal(plan.lessons.length, 24);
      assert.equal(plan.source, 'seed');
    } finally {
      if (prev !== undefined) process.env.MONGODB_URI = prev;
    }
  });
});
