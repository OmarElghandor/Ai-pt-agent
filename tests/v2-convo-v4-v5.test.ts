import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadAuthoredTopicBank } from '@/lib/v2/convo/goals/loadTopicBank';
import { coreGoals, MIN_CORE_GOALS } from '@/lib/v2/convo/goals/tiers';
import { teachBeatForGoal } from '@/lib/v2/convo/goals/teach';
import { isLearnerExitRequest } from '@/lib/v2/convo/exit/detect';
import { buildExitSummary } from '@/lib/v2/convo/exit/summary';

describe('conversations v4 · V5 goals lifecycle', () => {
  it('directions bank has ≥4 core goals with teach', () => {
    const bank = loadAuthoredTopicBank('direcoes');
    assert.ok(bank);
    const core = coreGoals(bank!);
    assert.ok(core.length >= MIN_CORE_GOALS, String(core.length));
    for (const g of core) {
      const beat = teachBeatForGoal(g);
      assert.ok(beat, g.id);
      assert.ok(beat!.character_tl.trim());
      assert.ok(beat!.coach_eg.trim());
      assert.ok(beat!.ask_tl.trim());
    }
  });

  it('detects خلّص / كفاية exit', () => {
    assert.equal(isLearnerExitRequest('كفاية'), true);
    assert.equal(isLearnerExitRequest('خلّص'), true);
    assert.equal(isLearnerExitRequest('خلاص'), true);
    assert.equal(isLearnerExitRequest('Bom dia'), false);
  });

  it('builds exit summary', () => {
    const summary = buildExitSummary({
      goals: [
        { id: 'a', status: 'done' },
        { id: 'b', status: 'assisted' },
        { id: 'c', status: 'open' },
      ],
      defs: [
        {
          id: 'a',
          intent_eg: 'x',
          examples_tl: ['De metro.'],
          keywords: ['metro'],
          help: { frame_tl: 'x', eg: 'x', chips: ['x'] },
        },
        {
          id: 'b',
          intent_eg: 'x',
          examples_tl: ['À direita.'],
          keywords: ['direita'],
          help: { frame_tl: 'x', eg: 'x', chips: ['x'] },
        },
        {
          id: 'c',
          intent_eg: 'x',
          examples_tl: ['Em frente.'],
          keywords: ['frente'],
          help: { frame_tl: 'x', eg: 'x', chips: ['x'] },
        },
      ],
    });
    assert.ok(summary.said.some((s) => /metro/i.test(s)));
    assert.ok(summary.weak.length >= 1);
    assert.match(summary.coach_eg, /خلصت/);
  });
});
