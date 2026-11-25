import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveThread } from '../lib/v2/review-chat/deriveThread';
import type { ReviewSession, ReviewStep } from '../lib/v2/review-chat/types';

function step(round: number, id: string): ReviewStep {
  return {
    lesson_day: 1,
    pairs: [{ item_id: id, skill: 'listening' }],
    round,
    question: {
      type: 'listen_meaning',
      id,
      options: ['a', 'b', 'c'],
      answer: 0,
      accepted: ['a'],
    },
  };
}

const session: ReviewSession = {
  local_date: '2026-11-25',
  budget_minutes: 14,
  window: [{ day: 1, position: 1 }],
  steps: [
    step(1, 'r1.a'),
    step(1, 'r1.b'),
    step(2, 'r2.a'),
    step(2, 'r2.b'),
  ],
  rounds_total: 2,
  rounds_done: 0,
  status: 'open',
  resume: { round: 1, step: 0 },
};

describe('v2 review-chat · deriveThread round end', () => {
  it('emits round_end when showRoundEnd on the last step of the round', () => {
    const { messages } = deriveThread({
      session,
      currentStep: 1, // last step of round 1
      expandedRounds: new Set(),
      localByStep: new Map([
        [
          1,
          {
            verdict: 'wrong',
            learnerText: 'b',
            feedback: { verdict: 'wrong', learner_text: 'b', correct_tl: 'a' },
          },
        ],
      ]),
      learnerName: 'عمر',
      showRoundEnd: true,
    });

    const end = messages.find((m) => m.kind === 'round_end');
    assert.ok(end, 'expected round_end message');
    assert.equal(end!.round, 1);
    assert.equal(end!.answeredCount, 2);

    assert.equal(
      messages.some((m) => m.kind === 'round_divider' && m.round === 2),
      false,
      'must not preview round 2 divider before continue',
    );
  });

  it('shows the next round divider after continuing past round end', () => {
    const { messages } = deriveThread({
      session,
      currentStep: 2, // first step of round 2
      expandedRounds: new Set(),
      localByStep: new Map(),
      learnerName: 'عمر',
      showRoundEnd: false,
    });

    assert.ok(
      messages.some((m) => m.kind === 'round_divider' && m.round === 2),
      'round 2 divider after continue',
    );
    assert.equal(
      messages.some((m) => m.kind === 'round_end'),
      false,
    );
  });
});
