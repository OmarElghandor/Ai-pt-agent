import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  currentDayFromCompleted,
  dayOverrideFromSearch,
} from '../lib/v2/progress/learnerDay';
import {
  buildPracticeWindow,
  PHASE1_STORY_DAYS,
} from '../lib/v2/practice/window';

describe('v2 practice · review current day (16 §3)', () => {
  it('current day is first non-completed', () => {
    assert.equal(currentDayFromCompleted([]), 1);
    assert.equal(currentDayFromCompleted([1]), 2);
    assert.equal(currentDayFromCompleted([1, 2, 3]), 4);
    assert.equal(currentDayFromCompleted([2, 1, 3, 1]), 4);
    // gap: day 2 missing → current stays 2
    assert.equal(currentDayFromCompleted([1, 3]), 2);
  });

  it('prefers progress over stale session max (pure contract)', () => {
    // Session might say day 5, but only 1 completed → current is 2
    const completed = [1];
    const staleSessionMax = 5;
    const fromProgress = currentDayFromCompleted(completed);
    assert.equal(fromProgress, 2);
    assert.notEqual(fromProgress, staleSessionMax);
  });

  it('?day= override still parses', () => {
    assert.equal(dayOverrideFromSearch('4'), 4);
    assert.equal(dayOverrideFromSearch(null), null);
    assert.equal(dayOverrideFromSearch('0'), null);
  });

  it('day 1 → empty window', () => {
    const w = buildPracticeWindow({
      currentDay: 1,
      completedDays: [],
      storyDays: PHASE1_STORY_DAYS,
    });
    assert.deepEqual(w, []);
  });

  it('completed 1–3 + day 4 → window [3,2,1]', () => {
    const w = buildPracticeWindow({
      currentDay: 4,
      completedDays: [1, 2, 3],
      storyDays: PHASE1_STORY_DAYS,
    });
    assert.deepEqual(
      w.map((x) => x.day),
      [3, 2, 1],
    );
    assert.deepEqual(
      w.map((x) => x.position),
      [1, 2, 3],
    );
  });

  it('learnerCurrentDay reads lesson progress, not sessions', () => {
    const src = readFileSync('lib/v2/progress/learnerDay.ts', 'utf8');
    assert.match(src, /V2LessonProgressModel/);
    assert.match(src, /currentDayFromCompleted/);
    assert.equal(src.includes('V2SessionModel'), false);
    assert.equal(src.includes('V2ItemStateModel'), false);
  });
});
