import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyKnow,
  applyStageEvidence,
  createItemState,
  stageMoveFrom,
  type ItemState,
} from '../lib/v2/progress';

function stateAt(
  stage: 1 | 2 | 3 | 4,
  stageAt: string,
  extra: Partial<ItemState> = {},
): ItemState {
  const base = createItemState({
    user_id: 'u1',
    item_id: extra.item_id ?? 'food.cheese',
    introducedDay: 1,
  });
  return {
    ...base,
    ...extra,
    stage,
    stage_at: stageAt,
    card: { ...base.card, ...(extra.card ?? {}) },
    usedCorrectlyIn: extra.usedCorrectlyIn ?? base.usedCorrectlyIn,
  };
}

describe('v2 stages · 16 §6', () => {
  it('same-day recognition + production → 2 only', () => {
    let s = stateAt(1, '2026-11-01');
    s = applyStageEvidence(s, {
      kind: 'recognition',
      localDate: '2026-11-02',
      correct: true,
      firstTry: true,
    });
    assert.equal(s.stage, 2);
    assert.equal(s.stage_at, '2026-11-02');
    s = applyStageEvidence(s, {
      kind: 'production',
      localDate: '2026-11-02',
      correct: true,
      firstTry: true,
      situationId: 'day:3',
    });
    assert.equal(s.stage, 2);
  });

  it('next-day production → 3', () => {
    let s = stateAt(2, '2026-11-02');
    s = applyStageEvidence(s, {
      kind: 'production',
      localDate: '2026-11-03',
      correct: true,
      firstTry: true,
      situationId: 'day:3',
    });
    assert.equal(s.stage, 3);
    assert.equal(s.first_recall_at, '2026-11-03');
  });

  it('cards and micro checks alone never pass 2', () => {
    let s = stateAt(1, '2026-11-01');
    s = applyStageEvidence(s, {
      kind: 'recognition',
      localDate: '2026-11-02',
      correct: true,
      fromCard: true,
      hint: false,
    });
    assert.equal(s.stage, 2);
    s = applyStageEvidence(s, {
      kind: 'recognition',
      localDate: '2026-11-05',
      correct: true,
      fromCard: true,
      hint: false,
    });
    assert.equal(s.stage, 2);
    s = applyStageEvidence(s, {
      kind: 'recognition',
      localDate: '2026-11-06',
      correct: true,
    });
    assert.equal(s.stage, 2);
  });

  it('a miss at 3 → 2', () => {
    let s = stateAt(3, '2026-11-03');
    s = applyStageEvidence(s, { kind: 'miss', localDate: '2026-11-04' });
    assert.equal(s.stage, 2);
  });

  it('cards never count as a situation', () => {
    let s = stateAt(3, '2026-11-03', {
      card: {
        interval: 21,
        dueAt: null,
        masteryLevel: 'learning',
        consecutiveCorrect: 3,
        face: 'recognize',
        knowCheckDueAt: null,
      },
    });
    s = applyStageEvidence(s, {
      kind: 'production',
      localDate: '2026-11-10',
      correct: true,
      fromCard: true,
      situationId: 'day:5',
    });
    assert.equal(s.usedCorrectlyIn.length, 0);
    assert.equal(s.stage, 3);
  });

  it('essential needs 3 situations for stage 4', () => {
    let s = stateAt(3, '2026-11-03', {
      card: {
        interval: 21,
        dueAt: null,
        masteryLevel: 'learning',
        consecutiveCorrect: 3,
        face: 'recognize',
        knowCheckDueAt: null,
      },
      usedCorrectlyIn: ['day:1', 'day:2'],
    });
    s = applyStageEvidence(s, {
      kind: 'production',
      localDate: '2026-11-10',
      correct: true,
      situationId: 'day:2',
      essential: true,
    });
    assert.equal(s.stage, 3);
    s = applyStageEvidence(s, {
      kind: 'production',
      localDate: '2026-11-11',
      correct: true,
      situationId: 'day:3',
      essential: true,
    });
    assert.equal(s.usedCorrectlyIn.length, 3);
    assert.equal(s.stage, 4);
  });

  it('"عارفها" stops at 3', () => {
    let s = stateAt(1, '2026-11-01');
    s = applyKnow(
      s,
      new Date('2026-11-05T12:00:00Z'),
      '2026-11-05',
      'ans-know-1',
    );
    assert.equal(s.stage, 3);
    assert.equal(s.card.masteryLevel, 'mastered');
    assert.equal(s.stage_answer_id, 'ans-know-1');
    s = applyStageEvidence(s, {
      kind: 'know',
      localDate: '2026-11-06',
    });
    assert.equal(s.stage, 3);
  });

  it('records the answer id on each stage move', () => {
    let s = stateAt(1, '2026-11-01');
    s = applyStageEvidence(s, {
      kind: 'recognition',
      localDate: '2026-11-02',
      correct: true,
      firstTry: true,
      answerId: 'ans-rec-1',
    });
    assert.equal(s.stage, 2);
    assert.equal(s.stage_answer_id, 'ans-rec-1');
    const before = s;
    s = applyStageEvidence(s, {
      kind: 'production',
      localDate: '2026-11-03',
      correct: true,
      firstTry: true,
      situationId: 'day:3',
      answerId: 'ans-prod-1',
    });
    assert.equal(s.stage, 3);
    assert.equal(s.stage_answer_id, 'ans-prod-1');
    const move = stageMoveFrom(before, s, 'ans-prod-1');
    assert.deepEqual(move, {
      item_id: 'food.cheese',
      from: 2,
      to: 3,
      answer_id: 'ans-prod-1',
    });
  });

  it('applies the same stages to pattern item ids', () => {
    let s = stateAt(1, '2026-11-01', { item_id: 'pattern.ser.present' });
    s = applyStageEvidence(s, {
      kind: 'recognition',
      localDate: '2026-11-02',
      correct: true,
      answerId: 'ans-pat-1',
    });
    assert.equal(s.stage, 2);
    assert.equal(s.item_id, 'pattern.ser.present');
    assert.equal(s.stage_answer_id, 'ans-pat-1');
  });
});
