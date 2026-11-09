import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  listAllowedTopics,
  listOpeningChips,
  TEACH_CHIP_LABEL_EG,
} from '@/lib/v2/convo/topics/allowed';
import { loadAuthoredTopicBank } from '@/lib/v2/convo/goals/loadTopicBank';
import { loadGoalsForDay } from '@/lib/v2/convo/goals/fromLesson';
import { loadGoalsForTopic } from '@/lib/v2/convo/goals/fromThreads';
import {
  levelOverrideFromBody,
  levelOverrideFromSearch,
} from '@/lib/v2/convo/level/learnerLevel';
import { maxIntroducedDay } from '@/lib/v2/convo/level/itemDays';

describe('conversations v4 · V2 allowed topics', () => {
  it('at level 1, only the day-1 introductions topic is allowed', () => {
    const allowed = listAllowedTopics(1);
    assert.ok(
      allowed.some((t) => t.id === 'day-1'),
      JSON.stringify(allowed.map((t) => t.id)),
    );
    assert.ok(!allowed.some((t) => t.id === 'casa'));
    assert.ok(!allowed.some((t) => t.id === 'trabalho'));
    assert.ok(!allowed.some((t) => t.id === 'comida'));
    assert.ok(!allowed.some((t) => t.id === 'direcoes'));
  });

  it('level 1 opening chips include introductions plus directions (هنتعلمه)', () => {
    const chips = listOpeningChips(1);
    const ids = chips.map((c) => c.id);
    assert.ok(ids.includes('day-1'), JSON.stringify(ids));
    assert.ok(ids.includes('direcoes'), JSON.stringify(ids));
    const dir = chips.find((c) => c.id === 'direcoes');
    assert.ok(dir?.above_level);
    assert.equal(dir?.badge_eg, TEACH_CHIP_LABEL_EG);
    const intro = chips.find((c) => c.id === 'day-1');
    assert.equal(intro?.above_level, false);
  });

  it('at level 20, casa and trabalho are allowed', () => {
    const allowed = listAllowedTopics(20);
    const ids = allowed.map((t) => t.id);
    assert.ok(ids.includes('casa'), JSON.stringify(ids));
    assert.ok(ids.includes('trabalho'), JSON.stringify(ids));
  });

  it('comida is not allowed before day 15', () => {
    const at14 = listAllowedTopics(14).map((t) => t.id);
    const at15 = listAllowedTopics(15).map((t) => t.id);
    assert.ok(!at14.includes('comida'), JSON.stringify(at14));
    assert.ok(at15.includes('comida'), JSON.stringify(at15));
  });

  it('stores required_items on banks', () => {
    const day1 = loadGoalsForDay(1);
    assert.ok((day1.required_items?.length ?? 0) > 0);
    const comida = loadGoalsForTopic('comida');
    assert.ok((comida.required_items?.length ?? 0) > 0);
    assert.equal(maxIntroducedDay(comida.required_items ?? []), 15);
    const dir = loadAuthoredTopicBank('direcoes');
    assert.ok(dir);
    assert.ok((dir!.required_items?.length ?? 0) > 0);
  });
});

describe('conversations v4 · V2 level override (dev only)', () => {
  it('parses ?level= when V2_DEV / non-production allows it', () => {
    // Test env is non-production → override accepted.
    assert.equal(levelOverrideFromSearch('20'), 20);
    assert.equal(levelOverrideFromBody(7), 7);
    assert.equal(levelOverrideFromSearch(''), null);
    assert.equal(levelOverrideFromBody('nope'), null);
  });
});
