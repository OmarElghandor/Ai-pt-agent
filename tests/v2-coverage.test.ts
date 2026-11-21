import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyCoverageResult,
  buildCoveragePlan,
  closeCoveragePlan,
  pairsForItem,
} from '../lib/v2/practice';

describe('v2 practice · coverage plans (16 §5.1)', () => {
  it('phrase = 4 pairs, word = 2, pattern = 4', () => {
    assert.equal(pairsForItem({ id: 'p1', kind: 'phrase' }).length, 4);
    assert.equal(pairsForItem({ id: 'w1', kind: 'word' }).length, 2);
    assert.equal(pairsForItem({ id: 'g1', kind: 'pattern' }).length, 4);
  });

  it('pairs passed in the lesson are removed', () => {
    const plan = buildCoveragePlan({
      user_id: 'u1',
      lesson_day: 3,
      items: [{ id: 'food.cheese', kind: 'word' }],
      passedInLesson: [{ item_id: 'food.cheese', skill: 'listening' }],
    });
    assert.equal(plan.pairs.length, 1);
    assert.equal(plan.pairs[0]?.skill, 'writing');
  });

  it('dictation covers 2 pairs', () => {
    let plan = buildCoveragePlan({
      user_id: 'u1',
      lesson_day: 3,
      items: [{ id: 'phrase.hi', kind: 'phrase' }],
    });
    plan = applyCoverageResult({
      plan,
      questionType: 'dictation',
      item_id: 'phrase.hi',
    });
    const covered = plan.pairs.filter((p) => p.status === 'covered');
    assert.equal(covered.length, 2);
    assert.ok(covered.some((p) => p.skill === 'listening'));
    assert.ok(covered.some((p) => p.skill === 'writing'));
  });

  it('full-sentence production covers words writing and pattern use', () => {
    let plan = buildCoveragePlan({
      user_id: 'u1',
      lesson_day: 3,
      items: [
        { id: 'food.cheese', kind: 'word' },
        { id: 'pattern.ser', kind: 'pattern' },
      ],
    });
    plan = applyCoverageResult({
      plan,
      questionType: 'translate_write',
      item_id: 'phrase.x',
      coreWordIds: ['food.cheese'],
      patternId: 'pattern.ser',
    });
    assert.ok(
      plan.pairs.some(
        (p) =>
          p.item_id === 'food.cheese' &&
          p.skill === 'writing' &&
          p.status === 'covered',
      ),
    );
    assert.ok(
      plan.pairs.some(
        (p) =>
          p.item_id === 'pattern.ser' &&
          p.skill === 'use' &&
          p.status === 'covered',
      ),
    );
  });

  it('self-rated speaking covers the plan pair only', () => {
    let plan = buildCoveragePlan({
      user_id: 'u1',
      lesson_day: 3,
      items: [{ id: 'phrase.hi', kind: 'phrase' }],
    });
    plan = applyCoverageResult({
      plan,
      questionType: 'say_it',
      item_id: 'phrase.hi',
      selfRatedSpeaking: true,
    });
    const covered = plan.pairs.filter((p) => p.status === 'covered');
    assert.equal(covered.length, 1);
    assert.equal(covered[0]?.skill, 'speaking');
  });

  it('close carries open pairs to weak', () => {
    const plan = buildCoveragePlan({
      user_id: 'u1',
      lesson_day: 3,
      items: [{ id: 'w1', kind: 'word' }],
    });
    const closed = closeCoveragePlan(plan);
    assert.ok(closed.pairs.every((p) => p.status === 'carried_to_weak'));
  });
});
