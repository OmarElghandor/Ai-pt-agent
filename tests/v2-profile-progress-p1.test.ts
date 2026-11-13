import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  AUTH_USER_COLLECTIONS,
  USER_KEYED_V2_COLLECTIONS,
} from '../lib/v2/auth/userKeyedCollections';
import {
  nextLocalDate,
  resolveLearnerTimezone,
  userLocalDate,
  DEFAULT_LEARNER_TIMEZONE,
} from '../lib/v2/progress/userLocalDate';
import { localDateString, startOfLocalDay } from '../lib/v2/progress/localDate';

describe('P1 · progress collections on deletion list', () => {
  it('includes the new user-keyed progress collections', () => {
    const all = new Set<string>([
      ...USER_KEYED_V2_COLLECTIONS,
      ...AUTH_USER_COLLECTIONS,
    ]);
    for (const name of [
      'v2_lesson_progress',
      'v2_weak_spots',
      'v2_card_decks',
      'v2_activity_days',
      'v2_problem_requests',
      'v2_progress_event_idempotency',
    ]) {
      assert.ok(all.has(name), `missing ${name}`);
    }
  });

  it('declares unique compound indexes in models.ts', () => {
    const src = readFileSync(
      path.join(process.cwd(), 'lib/v2/mongo/models.ts'),
      'utf8',
    );
    assert.match(src, /collection:\s*'v2_lesson_progress'/);
    assert.match(src, /collection:\s*'v2_weak_spots'/);
    assert.match(src, /collection:\s*'v2_card_decks'/);
    assert.match(src, /collection:\s*'v2_activity_days'/);
    assert.match(src, /collection:\s*'v2_problem_requests'/);
    assert.ok(src.includes("user_id: 1, target_lang: 1, day: 1"));
    assert.ok(src.includes("user_id: 1, problem: 1"));
    assert.ok(src.includes("user_id: 1, local_date: 1"));
    assert.ok(src.includes('problem:'));
  });
});

describe('P1 · user local date', () => {
  it('defaults invalid timezone to Europe/Lisbon', () => {
    assert.equal(resolveLearnerTimezone(null), DEFAULT_LEARNER_TIMEZONE);
    assert.equal(resolveLearnerTimezone('Not/AZone'), DEFAULT_LEARNER_TIMEZONE);
    assert.equal(resolveLearnerTimezone('America/New_York'), 'America/New_York');
  });

  it('flips the local date at midnight in the learner timezone', () => {
    const tz = 'Europe/Lisbon';
    // Pick a UTC instant just before and after Lisbon midnight on a known day.
    // 2024-06-15 00:00 in Lisbon = 2024-06-14 23:00 UTC (WEST, UTC+1).
    const before = new Date('2024-06-14T22:59:00.000Z');
    const after = new Date('2024-06-14T23:00:00.000Z');
    assert.equal(userLocalDate(tz, before), '2024-06-14');
    assert.equal(userLocalDate(tz, after), '2024-06-15');
    assert.equal(localDateString(after, tz), '2024-06-15');
    assert.equal(
      localDateString(startOfLocalDay(after, tz, 0), tz),
      '2024-06-15',
    );
  });

  it('nextLocalDate advances one calendar day', () => {
    assert.equal(nextLocalDate('2024-06-14', 'Europe/Lisbon'), '2024-06-15');
    assert.equal(nextLocalDate('2024-12-31', 'Europe/Lisbon'), '2025-01-01');
  });
});
