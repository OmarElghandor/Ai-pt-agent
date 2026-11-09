import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clearCoachBankCache,
  loadCoachBank,
  pickCoachLine,
} from '@/lib/v2/convo/encouragement';

const REQUIRED_MOMENTS = [
  'first_said',
  'success_after_struggle',
  'streak_3',
  'group_done',
  'returned_after_break',
  'conversation_finished',
  'miss_1',
  'miss_2',
  'miss_3',
  'miss_4',
  'unclear',
  'arabic_answer',
  'near_miss_repeat',
] as const;

describe('v2 convo encouragement', () => {
  it('every moment has at least 6 variants with unique ids', () => {
    clearCoachBankCache();
    const bank = loadCoachBank();
    for (const moment of REQUIRED_MOMENTS) {
      const lines = bank[moment];
      assert.ok(lines, `missing moment ${moment}`);
      assert.ok(
        lines.length >= 6,
        `${moment} has ${lines.length} variants, need ≥6`,
      );
      const ids = new Set(lines.map((l) => l.id));
      assert.equal(ids.size, lines.length, `${moment} duplicate ids`);
    }
  });

  it('fills {item} slot', () => {
    const result = pickCoachLine({
      moment: 'first_said',
      itemTl: 'direita',
      recentIds: [],
      random: () => 0,
    });
    assert.match(result.eg, /direita/);
    assert.ok(!result.eg.includes('{item}'));
  });

  it('appends memory trick on miss_2', () => {
    const result = pickCoachLine({
      moment: 'miss_2',
      itemTl: 'direita',
      memoryTrickEg: 'direita فيها d زي direction',
      recentIds: [],
      random: () => 0,
    });
    assert.match(result.eg, /direita فيها d/);
  });

  it('never repeats any of the last 3 across 20 picks', () => {
    let recent: string[] = [];
    const seenPairs: string[] = [];
    for (let i = 0; i < 20; i++) {
      const result = pickCoachLine({
        moment: 'miss_1',
        recentIds: recent,
        random: () => (i * 0.17) % 1,
      });
      assert.ok(
        !recent.includes(result.id),
        `pick ${i} repeated recent id ${result.id} in [${recent.join(',')}]`,
      );
      recent = result.recentIds;
      seenPairs.push(result.id);
      assert.ok(recent.length <= 3);
      assert.equal(recent[recent.length - 1], result.id);
    }
    assert.equal(seenPairs.length, 20);
  });

  it('updates recentIds newest-last capped at 3', () => {
    let recent: string[] = [];
    for (let i = 0; i < 5; i++) {
      const result = pickCoachLine({
        moment: 'streak_3',
        recentIds: recent,
        random: () => i / 10,
      });
      recent = result.recentIds;
    }
    assert.equal(recent.length, 3);
  });
});
