import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  reduceFreeTalkStream,
  type FreeTalkStreamState,
} from '@/components/v2/convo/freeTalkStreamReduce';
import type { TalkBubble } from '@/components/v2/convo/types';
import type { ConvoTurnStreamEvent } from '@/lib/v2/convo/turn';

function applyAll(
  initial: FreeTalkStreamState,
  events: ConvoTurnStreamEvent[],
): FreeTalkStreamState {
  let i = 0;
  const newId = (prefix: string) => `${prefix}-${++i}`;
  return events.reduce(
    (state, event) => reduceFreeTalkStream(state, event, { newId }),
    initial,
  );
}

describe('free-talk stream reduce · tip vanish fix', () => {
  it('empty reaction_reset then finalize keeps character PT', () => {
    const learner: TalkBubble = {
      id: 'learner-1',
      role: 'learner',
      tl: 'Sim Eu gosto carne',
    };
    let state: FreeTalkStreamState = {
      bubbles: [learner],
      streamBubbleId: null,
      correctionIndex: 0,
    };

    state = applyAll(state, [
      { type: 'reaction_delta', text: 'Tudo bem, obrigada!' },
      { type: 'reaction_reset', text: '' },
      {
        type: 'bubble_ar',
        ar: 'بخير، شكراً!',
        pt: 'Gostas de carne? O que mais?',
      },
      {
        type: 'question',
        id: 'q1',
        tl: 'Gostas de carne? O que mais?',
        kind: 'open',
        item_id: 'g1',
        audio_key: 'free:x',
      },
      {
        type: 'correction',
        learner_turn_id: 'learner-1',
        severity: 'error',
        corrected_tl: 'Sim, eu gosto de carne.',
        changes: [{ from: 'gosto carne', to: 'gosto de carne' }],
        main_error: {
          from: 'gosto carne',
          to: 'gosto de carne',
          type: 'preposition',
        },
        note_eg: 'بعد gosto لازم de',
        ar: 'أحب اللحم',
        original: 'Sim Eu gosto carne',
      },
    ]);

    const chars = state.bubbles.filter((b) => b.role === 'character');
    assert.ok(chars.length >= 1, 'character bubble must remain');
    assert.ok(
      chars.some((b) => b.role === 'character' && /Gostas de carne/.test(b.tl)),
      JSON.stringify(chars),
    );
    const learnerOut = state.bubbles.find((b) => b.id === 'learner-1');
    assert.ok(learnerOut && learnerOut.role === 'learner');
    assert.ok(learnerOut.correction);
    assert.equal(learnerOut.correction?.corrected_tl, 'Sim, eu gosto de carne.');
  });

  it('empty reset does not delete a finalized character bubble', () => {
    const state0: FreeTalkStreamState = {
      bubbles: [
        {
          id: 'char-old',
          role: 'character',
          tl: 'Olá!',
          final: true,
          streaming: false,
        },
      ],
      streamBubbleId: 'char-old',
      correctionIndex: 0,
    };
    const state = reduceFreeTalkStream(state0, {
      type: 'reaction_reset',
      text: '',
    });
    assert.equal(state.bubbles.length, 1);
    assert.equal(
      state.bubbles[0] && state.bubbles[0].role === 'character'
        ? state.bubbles[0].tl
        : '',
      'Olá!',
    );
    assert.equal(state.streamBubbleId, null);
  });

  it('v4 V1: empty reaction_reset drops in-flight character bubble', () => {
    const state = applyAll(
      { bubbles: [], streamBubbleId: null, correctionIndex: 0 },
      [
        { type: 'reaction_delta', text: 'partial…' },
        { type: 'reaction_reset', text: '' },
      ],
    );
    assert.equal(
      state.bubbles.filter((b) => b.role === 'character').length,
      0,
    );
    assert.equal(state.streamBubbleId, null);
  });

  it('v4 V1: bubble_ar without pt drops empty in-flight bubble', () => {
    const state0: FreeTalkStreamState = {
      bubbles: [
        {
          id: 'char-empty',
          role: 'character',
          tl: '',
          streaming: true,
        },
      ],
      streamBubbleId: 'char-empty',
      correctionIndex: 0,
    };
    const state = reduceFreeTalkStream(state0, {
      type: 'bubble_ar',
      ar: 'معنى',
      pt: '',
    });
    assert.equal(
      state.bubbles.filter((b) => b.role === 'character').length,
      0,
    );
  });

  it('question with no stream id appends character bubble', () => {
    const state = reduceFreeTalkStream(
      { bubbles: [], streamBubbleId: null, correctionIndex: 0 },
      {
        type: 'question',
        id: 'q',
        tl: 'Como estás?',
        kind: 'open',
        item_id: 'x',
        audio_key: 'a',
      },
      { newId: (p) => `${p}-1` },
    );
    assert.equal(state.bubbles.length, 1);
    assert.equal(
      state.bubbles[0] && state.bubbles[0].role === 'character'
        ? state.bubbles[0].tl
        : '',
      'Como estás?',
    );
  });

  it('consecutive reaction_deltas append into one character bubble', () => {
    const state = applyAll(
      { bubbles: [], streamBubbleId: null, correctionIndex: 0 },
      [
        { type: 'reaction_delta', text: 'Olá' },
        { type: 'reaction_delta', text: ', ' },
        { type: 'reaction_delta', text: 'tudo bem?' },
      ],
    );
    const chars = state.bubbles.filter((b) => b.role === 'character');
    assert.equal(chars.length, 1);
    assert.equal(
      chars[0] && chars[0].role === 'character' ? chars[0].tl : '',
      'Olá, tudo bem?',
    );
    assert.ok(state.streamBubbleId);
    assert.equal(state.streamBubbleId, chars[0]?.id);
  });

  it('teach bubble_ar merges ask question into one character bubble', () => {
    const state = applyAll(
      { bubbles: [], streamBubbleId: null, correctionIndex: 0 },
      [
        {
          type: 'bubble_ar',
          ar: 'جيد! اخرج من المحطة.',
          pt: 'Boa! Sais da estação e viras à direita. ➡️ Vais à direita?',
          coach_eg: 'à direita = يمين',
          teach_goal_id: 'dir.right',
        },
        {
          type: 'question',
          id: 'dir.right',
          tl: 'Vais à direita?',
          kind: 'open',
          item_id: 'dir.right',
          audio_key: 'free:x',
        },
      ],
    );
    const chars = state.bubbles.filter((b) => b.role === 'character');
    assert.equal(chars.length, 1);
    const c = chars[0]!;
    assert.ok(c.role === 'character');
    assert.ok(c.tl.includes('Vais à direita?'));
    assert.equal(c.coachEg, 'à direita = يمين');
    assert.equal(c.teachGoalId, 'dir.right');
    assert.equal(c.coachRevealed, false);
  });

  it('bubble_ar then question with same tl does not duplicate', () => {
    const state = applyAll(
      { bubbles: [], streamBubbleId: null, correctionIndex: 0 },
      [
        { type: 'reaction_delta', text: 'Gostas' },
        { type: 'reaction_delta', text: ' de carne?' },
        {
          type: 'bubble_ar',
          ar: 'بتحب اللحمة؟',
          pt: 'Gostas de carne?',
        },
        {
          type: 'question',
          id: 'q1',
          tl: 'Gostas de carne?',
          kind: 'open',
          item_id: 'g1',
          audio_key: 'free:x',
        },
      ],
    );
    const chars = state.bubbles.filter((b) => b.role === 'character');
    assert.equal(chars.length, 1);
    assert.equal(
      chars[0] && chars[0].role === 'character' ? chars[0].tl : '',
      'Gostas de carne?',
    );
    assert.equal(
      chars[0] && chars[0].role === 'character' ? chars[0].final : false,
      true,
    );
    assert.equal(state.streamBubbleId, null);
  });
});
